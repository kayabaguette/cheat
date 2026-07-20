// HTTP handlers for the coarse whole-AppState persistence API, scoped per PROFILE.
//
//	GET    /api/profiles            -> { profiles: [{id,name}], activeId }
//	POST   /api/profiles            <- { name, cloneFrom? } ; 201 { id, name }
//	PUT    /api/profiles/:id        <- { name } ; rename
//	DELETE /api/profiles/:id        ; delete (409 if it is the last profile)
//	POST   /api/profiles/:id/activate ; set the active profile
//	GET    /api/profiles/:id/state  -> { initialized, state }
//	PUT    /api/profiles/:id/state  <- AppState ; full REPLACE of that profile
//	GET    /api/export              -> ACTIVE profile's AppState as a download
//	POST   /api/import              <- AppState ; full REPLACE of the ACTIVE profile (D4)
//
// All routes are registered under /api BEFORE the SPA fallback so /api/* never
// falls through to index.html.
package main

import (
	"errors"
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// maxBodyBytes caps request bodies on the write endpoints. The server binds
// 0.0.0.0 with no auth, so an unbounded PUT body would be a LAN-reachable
// memory-exhaustion DoS; 8 MiB sits well above any real dataset.
const maxBodyBytes = 8 << 20

// exportDateRe validates the optional ?date= filename hint (YYYY-MM-DD) so no
// attacker-influenced text is reflected into the Content-Disposition header.
var exportDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// limitBody caps the request body size before any handler reads it.
func limitBody(max int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, max)
		c.Next()
	}
}

// dbError maps a store error to an HTTP status + JSON body.
func dbError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
	case errors.Is(err, errLastProfile):
		c.JSON(http.StatusConflict, gin.H{"error": "cannot delete the last profile"})
	case errors.Is(err, errEmptyName):
		c.JSON(http.StatusBadRequest, gin.H{"error": "profile name required"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "store error"})
	}
}

// registerAPI wires the persistence endpoints onto the given /api group.
func registerAPI(api *gin.RouterGroup, db *gorm.DB) {
	api.Use(limitBody(maxBodyBytes))

	api.GET("/profiles", func(c *gin.Context) {
		profiles, err := listProfiles(db)
		if err != nil {
			dbError(c, err)
			return
		}
		activeID, err := getActiveProfileID(db)
		if err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"profiles": profiles, "activeId": activeID})
	})

	api.POST("/profiles", func(c *gin.Context) {
		var body struct {
			Name      string `json:"name"`
			CloneFrom string `json:"cloneFrom"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		meta, err := createProfile(db, body.Name, body.CloneFrom)
		if err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, meta)
	})

	api.PUT("/profiles/:id", func(c *gin.Context) {
		var body struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if err := renameProfile(db, c.Param("id"), body.Name); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	api.DELETE("/profiles/:id", func(c *gin.Context) {
		if err := deleteProfile(db, c.Param("id")); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	api.POST("/profiles/:id/activate", func(c *gin.Context) {
		if err := setActiveProfileID(db, c.Param("id")); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	api.GET("/profiles/:id/state", func(c *gin.Context) {
		state, err := loadProfileState(db, c.Param("id"))
		if err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"initialized": true, "state": state})
	})

	api.PUT("/profiles/:id/state", func(c *gin.Context) {
		var state AppState
		if err := c.ShouldBindJSON(&state); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AppState body"})
			return
		}
		if err := saveProfileState(db, c.Param("id"), state); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	api.GET("/export", func(c *gin.Context) {
		state, err := activeState(db)
		if err != nil {
			dbError(c, err)
			return
		}
		// Downloadable attachment. The client may pass ?date=YYYY-MM-DD for the
		// filename; only a strict date shape is honored, otherwise a fixed name
		// (never reflect raw query input into the response header).
		name := "cheat-export.json"
		if date := c.Query("date"); exportDateRe.MatchString(date) {
			name = "cheat-export-" + date + ".json"
		}
		c.Header("Content-Disposition", `attachment; filename="`+name+`"`)
		c.JSON(http.StatusOK, state)
	})

	// D4: import is a full REPLACE of the ACTIVE profile.
	api.POST("/import", func(c *gin.Context) {
		var state AppState
		if err := c.ShouldBindJSON(&state); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AppState body"})
			return
		}
		id, err := getActiveProfileID(db)
		if err != nil {
			dbError(c, err)
			return
		}
		if err := saveProfileState(db, id, state); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}

// activeState loads the AppState of the currently active profile.
func activeState(db *gorm.DB) (AppState, error) {
	id, err := getActiveProfileID(db)
	if err != nil {
		return emptyState(), err
	}
	return loadProfileState(db, id)
}
