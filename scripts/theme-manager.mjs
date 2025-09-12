#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path constants
const ROOT_DIR = path.resolve(__dirname, "..")
const CLIENT_DIR = path.join(ROOT_DIR, "client")
const THEMES_DIR = path.join(CLIENT_DIR, "themes")
const INDEX_CSS_PATH = path.join(CLIENT_DIR, "index.css")
const INDEX_HTML_PATH = path.join(CLIENT_DIR, "index.html")

class ThemeManager {
  /**
   * Set the active theme by updating the import in index.css
   * @param {string} themeName - Name of theme (without .css extension)
   */
  async setTheme(themeName) {
    try {
      // Validate theme exists
      const themePath = path.join(THEMES_DIR, `${themeName}.css`)
      if (!fs.existsSync(themePath)) {
        throw new Error(
          `Theme '${themeName}' not found. Available themes: ${this.getAvailableThemeNames().join(
            ", "
          )}`
        )
      }

      // Read current index.css
      const indexCSS = fs.readFileSync(INDEX_CSS_PATH, "utf8")

      // Use regex to find and replace the theme import line
      // This handles cases where import is not on first line and accounts for different quote styles
      const themeImportRegex = /@import\s+["']\.\/themes\/[^"']+\.css["']\s*;/
      const newImportLine = `@import "./themes/${themeName}.css";`

      if (!themeImportRegex.test(indexCSS)) {
        throw new Error(
          'No theme import found in index.css. Expected format: @import "./themes/theme-name.css";'
        )
      }

      const updatedCSS = indexCSS.replace(themeImportRegex, newImportLine)

      // Write back to file
      fs.writeFileSync(INDEX_CSS_PATH, updatedCSS, "utf8")

      console.log(`✅ Theme set to '${themeName}'`)
    } catch (error) {
      console.error(`❌ Error setting theme: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Get all available theme names
   * @returns {string[]} Array of theme names without .css extension
   */
  getAvailableThemeNames() {
    try {
      return fs
        .readdirSync(THEMES_DIR)
        .filter((file) => file.endsWith(".css"))
        .map((file) => file.replace(".css", ""))
    } catch (error) {
      console.error(`❌ Error reading themes directory: ${error.message}`)
      return []
    }
  }

  /**
   * Get the currently active theme name
   * @returns {string|null} Current theme name or null if not found
   */
  getCurrentTheme() {
    try {
      const indexCSS = fs.readFileSync(INDEX_CSS_PATH, "utf8")
      const match = indexCSS.match(
        /@import\s+["']\.\/themes\/([^"']+)\.css["']/
      )
      return match ? match[1] : null
    } catch (error) {
      console.error(`❌ Error reading current theme: ${error.message}`)
      return null
    }
  }

  /**
   * Extract color palette from a theme CSS file
   * @param {string} themeName - Name of theme without .css extension
   * @param {boolean} fullPalette - If true, extract all CSS variables, not just target colors
   * @returns {object} Object with light and dark color palettes
   */
  extractColorPalette(themeName, fullPalette = false) {
    try {
      const themePath = path.join(THEMES_DIR, `${themeName}.css`)
      const cssContent = fs.readFileSync(themePath, "utf8")

      const palette = {
        light: {},
        dark: {},
      }

      const parseMethod = fullPalette
        ? this.parseAllColorVariables.bind(this)
        : this.parseColorVariables.bind(this)

      // Extract colors from :root (light mode)
      const rootMatch = cssContent.match(/:root\s*{([^}]+)}/s)
      if (rootMatch) {
        palette.light = parseMethod(rootMatch[1])
      }

      // Extract colors from .dark (dark mode)
      const darkMatch = cssContent.match(/\.dark\s*{([^}]+)}/s)
      if (darkMatch) {
        palette.dark = parseMethod(darkMatch[1])
      }

      return palette
    } catch (error) {
      console.error(
        `❌ Error extracting palette for ${themeName}: ${error.message}`
      )
      return { light: {}, dark: {} }
    }
  }

  /**
   * Parse CSS variables from a CSS block
   * @param {string} cssBlock - CSS content between { }
   * @returns {object} Object with color variable names and values
   */
  parseColorVariables(cssBlock) {
    const colors = {}
    const targetColors = [
      "background",
      "foreground",
      "primary",
      "secondary",
      "accent",
      "destructive",
    ]

    // Match CSS variables: --variable-name: value;
    const variableRegex = /--([^:]+):\s*([^;]+);/g
    let match

    while ((match = variableRegex.exec(cssBlock)) !== null) {
      const varName = match[1].trim()
      const varValue = match[2].trim()

      // Only include the target colors we care about
      if (targetColors.includes(varName)) {
        colors[varName] = varValue
      }
    }

    return colors
  }

  /**
   * Parse ALL CSS variables from a CSS block (for full theme inheritance)
   * @param {string} cssBlock - CSS content between { }
   * @returns {object} Object with all CSS variable names and values
   */
  parseAllColorVariables(cssBlock) {
    const colors = {}

    // Match CSS variables: --variable-name: value;
    const variableRegex = /--([^:]+):\s*([^;]+);/g
    let match

    while ((match = variableRegex.exec(cssBlock)) !== null) {
      const varName = match[1].trim()
      const varValue = match[2].trim()
      colors[varName] = varValue
    }

    return colors
  }

  /**
   * List all available themes with their color palettes
   * @returns {object} JSON object with themes data
   */
  async listThemes() {
    try {
      const themes = this.getAvailableThemeNames()
      const currentTheme = this.getCurrentTheme()

      if (themes.length === 0) {
        const result = {
          error: "No themes found in themes directory",
          themes: [],
        }
        console.log(JSON.stringify(result, null, 2))
        return result
      }

      const themesData = themes.map((themeName) => {
        const isActive = themeName === currentTheme
        const palette = this.extractColorPalette(themeName)

        return {
          name: themeName,
          active: isActive,
          colors: {
            light: palette.light,
            dark: palette.dark,
          },
        }
      })

      const result = {
        currentTheme,
        totalThemes: themes.length,
        themes: themesData,
      }

      console.log(JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      const errorResult = {
        error: `Error listing themes: ${error.message}`,
        themes: [],
      }
      console.log(JSON.stringify(errorResult, null, 2))
      process.exit(1)
    }
  }

  /**
   * Check if dark mode is currently enabled
   * @returns {boolean} True if dark mode is enabled
   */
  isDarkModeEnabled() {
    try {
      const htmlContent = fs.readFileSync(INDEX_HTML_PATH, "utf8")
      // Check if body tag has class="dark" or class="... dark ..."
      const bodyMatch = htmlContent.match(/<body[^>]*>/)
      if (!bodyMatch) {
        throw new Error("Body tag not found in index.html")
      }

      const bodyTag = bodyMatch[0]
      const classMatch = bodyTag.match(/class=["']([^"']*)["']/)

      if (!classMatch) {
        return false // No class attribute
      }

      const classes = classMatch[1].split(/\s+/)
      return classes.includes("dark")
    } catch (error) {
      console.error(`❌ Error checking dark mode status: ${error.message}`)
      return false
    }
  }

  /**
   * Enable or disable dark mode by managing the 'dark' class on body element
   * @param {boolean} enable - True to enable dark mode, false to disable
   */
  async setDarkMode(enable) {
    try {
      let htmlContent = fs.readFileSync(INDEX_HTML_PATH, "utf8")

      // Find the body tag
      const bodyTagRegex = /<body([^>]*)>/
      const bodyMatch = htmlContent.match(bodyTagRegex)

      if (!bodyMatch) {
        throw new Error("Body tag not found in index.html")
      }

      const bodyAttributes = bodyMatch[1]
      let newBodyTag

      // More robust class attribute matching that handles malformed quotes
      const classMatch = bodyAttributes.match(/class\s*=\s*["']([^"'>]*)["']?/)

      if (classMatch) {
        // Class attribute exists, modify it
        const currentClasses = classMatch[1]
          .split(/\s+/)
          .filter((c) => c.length > 0)
        const hasDark = currentClasses.includes("dark")

        if (enable && !hasDark) {
          currentClasses.push("dark")
        } else if (!enable && hasDark) {
          const darkIndex = currentClasses.indexOf("dark")
          currentClasses.splice(darkIndex, 1)
        }

        const newClassValue = currentClasses.join(" ")
        if (newClassValue) {
          // Replace the entire class attribute more safely
          const newAttributes = bodyAttributes.replace(
            /class\s*=\s*["']([^"'>]*)["']?/,
            `class="${newClassValue}"`
          )
          newBodyTag = `<body${newAttributes}>`
        } else {
          // Remove class attribute if no classes left
          const newAttributes = bodyAttributes.replace(
            /\s*class\s*=\s*["']([^"'>]*)["']?/,
            ""
          )
          newBodyTag = `<body${newAttributes}>`
        }
      } else {
        // No class attribute exists, add one if enabling dark mode
        if (enable) {
          newBodyTag = `<body${bodyAttributes} class="dark">`
        } else {
          newBodyTag = `<body${bodyAttributes}>`
        }
      }

      // Replace the body tag in the HTML
      htmlContent = htmlContent.replace(bodyTagRegex, newBodyTag)

      // Write back to file
      fs.writeFileSync(INDEX_HTML_PATH, htmlContent, "utf8")

      console.log(`✅ Dark mode ${enable ? "enabled" : "disabled"}`)
    } catch (error) {
      console.error(`❌ Error setting dark mode: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Delete a theme by removing its CSS file
   * @param {string} themeName - Name of the theme to delete
   */
  async deleteTheme(themeName) {
    try {
      // Prevent deletion of default theme
      if (themeName === "default") {
        throw new Error("Cannot delete the default theme")
      }

      const themePath = path.join(THEMES_DIR, `${themeName}.css`)

      // Check if theme exists
      if (!fs.existsSync(themePath)) {
        throw new Error(`Theme '${themeName}' not found.`)
      }

      // Check if this is the currently active theme
      const currentTheme = this.getCurrentTheme()
      if (currentTheme === themeName) {
        throw new Error(
          `Cannot delete '${themeName}' because it is currently active. Please switch to another theme first.`
        )
      }

      // Delete the theme file
      fs.unlinkSync(themePath)

      console.log(`✅ Theme '${themeName}' deleted successfully`)
    } catch (error) {
      console.error(`❌ Error deleting theme: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Add or update a theme based on JSON input
   * @param {string} themeName - Name of the theme
   * @param {object} themeData - Theme data object with light/dark color definitions
   */
  async addOrUpdateTheme(themeName, themeData) {
    try {
      const themePath = path.join(THEMES_DIR, `${themeName}.css`)
      const exists = fs.existsSync(themePath)

      let finalThemeData

      if (exists && !themeData.light && !themeData.dark) {
        // If theme exists and only partial data provided, merge with existing
        const existingPalette = this.extractColorPalette(themeName)
        finalThemeData = {
          light: { ...existingPalette.light, ...themeData },
          dark: { ...existingPalette.dark },
        }
      } else if (!exists) {
        // If theme doesn't exist, use default as base with ALL properties
        const defaultPalette = this.extractColorPalette("default", true)
        finalThemeData = {
          light: { ...defaultPalette.light, ...(themeData.light || themeData) },
          dark: { ...defaultPalette.dark, ...(themeData.dark || {}) },
        }
      } else {
        // Use provided data as-is
        finalThemeData = themeData
      }

      // Generate CSS content
      const cssContent = this.generateThemeCSS(finalThemeData)

      // Write theme file
      fs.writeFileSync(themePath, cssContent, "utf8")

      console.log(
        `✅ Theme '${themeName}' ${exists ? "updated" : "created"} successfully`
      )
    } catch (error) {
      console.error(`❌ Error adding/updating theme: ${error.message}`)
      process.exit(1)
    }
  }

  /**
   * Generate CSS content from theme data
   * @param {object} themeData - Object with light and dark color definitions
   * @returns {string} Generated CSS content
   */
  generateThemeCSS(themeData) {
    let css = "@layer base {\n  :root {\n"

    // Add standard properties first
    css += "    --radius: 0.65rem;\n"

    // Add light mode colors
    Object.entries(themeData.light).forEach(([key, value]) => {
      css += `    --${key}: ${value};\n`
    })

    css += "  }\n\n"

    // Add dark mode colors if they exist
    if (themeData.dark && Object.keys(themeData.dark).length > 0) {
      css += "  .dark {\n"
      Object.entries(themeData.dark).forEach(([key, value]) => {
        css += `    --${key}: ${value};\n`
      })
      css += "  }\n"
    }

    css += "}\n"

    return css
  }

  /**
   * Show usage information
   */
  showUsage() {
    console.log(`
🎨 Theme Manager

Usage:
  node theme-manager.mjs <command> [options]

Commands:
  set <theme-name>              Set active theme
  list                          List all available themes with color palettes
  dark-mode <on|off>           Enable or disable dark mode
  add <theme-name> <json>      Add or update theme from JSON data
  delete <theme-name>          Delete a theme (except default)

Examples:
  node theme-manager.mjs set violet
  node theme-manager.mjs list
  node theme-manager.mjs dark-mode on
  node theme-manager.mjs dark-mode off
  node theme-manager.mjs add custom '{"light":{"primary":"red","background":"white"},"dark":{"primary":"lightred","background":"black"}}'
  node theme-manager.mjs add custom '{"primary":"blue"}'  // Updates only primary color
  node theme-manager.mjs delete custom
`)
  }
}

// CLI Interface
async function main() {
  const manager = new ThemeManager()
  const args = process.argv.slice(2)

  if (args.length === 0) {
    manager.showUsage()
    return
  }

  const command = args[0]

  try {
    switch (command) {
      case "set":
        if (args.length < 2) {
          console.error("❌ Theme name required")
          process.exit(1)
        }
        await manager.setTheme(args[1])
        break

      case "list":
        await manager.listThemes()
        break

      case "dark-mode":
        if (args.length < 2) {
          console.error('❌ Please specify "on" or "off"')
          process.exit(1)
        }
        const enable = args[1].toLowerCase() === "on"
        await manager.setDarkMode(enable)
        break

      case "add":
        if (args.length < 3) {
          console.error("❌ Theme name and JSON data required")
          process.exit(1)
        }
        const themeName = args[1]
        const jsonData = JSON.parse(args[2])
        await manager.addOrUpdateTheme(themeName, jsonData)
        break

      case "delete":
        if (args.length < 2) {
          console.error("❌ Theme name required")
          process.exit(1)
        }
        await manager.deleteTheme(args[1])
        break

      default:
        console.error(`❌ Unknown command: ${command}`)
        manager.showUsage()
        process.exit(1)
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export default ThemeManager
