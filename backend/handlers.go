// HTTP handlers for the coarse whole-AppState persistence API (M3).
//
//	GET  /api/state   -> { initialized, state }
//	PUT  /api/state   <- AppState ; full transactional REPLACE, sets initialized
//	GET  /api/export  -> AppState JSON as a downloadable attachment
//	POST /api/import  <- AppState ; identical to PUT (full REPLACE, SPEC D4)
//
// All routes are registered under /api BEFORE the SPA fallback so /api/* never
// falls through to index.html.
package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// registerAPI wires the persistence endpoints onto the given /api group.
func registerAPI(api *gin.RouterGroup, db *gorm.DB) {
	api.GET("/state", func(c *gin.Context) {
		initialized, state, err := loadState(db)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"initialized": initialized, "state": state})
	})

	api.PUT("/state", replaceStateHandler(db))
	api.POST("/import", replaceStateHandler(db)) // D4: import is a full REPLACE

	api.GET("/export", func(c *gin.Context) {
		_, state, err := loadState(db)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "load failed"})
			return
		}
		// Downloadable attachment. The client may pass ?date=YYYY-MM-DD for the
		// filename; fall back to a fixed name when absent.
		date := c.Query("date")
		name := "cheat-export.json"
		if date != "" {
			name = "cheat-export-" + date + ".json"
		}
		c.Header("Content-Disposition", `attachment; filename="`+name+`"`)
		c.JSON(http.StatusOK, state)
	})
}

// replaceStateHandler decodes an AppState body and REPLACES all persisted data
// transactionally, setting initialized=true. Shared by PUT /state and POST
// /import.
func replaceStateHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var state AppState
		if err := c.ShouldBindJSON(&state); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AppState body"})
			return
		}
		if err := saveState(db, state); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
