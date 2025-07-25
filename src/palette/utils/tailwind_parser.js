#!/usr/bin/env node

/**
 * Tailwind Config Parser
 * 
 * This Node.js script safely executes tailwind config files (.js, .ts, .mjs)
 * and extracts the resolved theme object, outputting it as JSON for Python consumption.
 * 
 * Usage: node tailwind_parser.js <path_to_tailwind_config>
 * Output: JSON object with theme configuration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Function to try importing resolveConfig from different locations
function tryImportResolveConfig(configPath) {
    // Try from the config's directory first
    const configDir = path.dirname(path.resolve(configPath));
    const projectPaths = [
        // Try from project's node_modules
        path.join(configDir, 'node_modules', 'tailwindcss', 'resolveConfig'),
        // Try from parent directories (in case config is in subdirectory)
        path.join(configDir, '..', 'node_modules', 'tailwindcss', 'resolveConfig'),
        // Try relative to current working directory
        path.join(process.cwd(), 'node_modules', 'tailwindcss', 'resolveConfig'),
        // Try global
        'tailwindcss/resolveConfig',
    ];
    
    for (const modulePath of projectPaths) {
        try {
            const resolveConfig = require(modulePath);
            console.error(`Info: Found resolveConfig at ${modulePath}`);
            return resolveConfig;
        } catch (e) {
            // Continue to next path
        }
    }
    
    console.error('Warning: Could not find tailwindcss/resolveConfig in any location');
    return null;
}

async function parseConfig(configPath) {
    try {
        // Check if config file exists
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }

        const ext = path.extname(configPath);
        let config;

        if (ext === '.ts') {
            // Handle TypeScript files
            config = await parseTypeScriptConfig(configPath);
        } else {
            // Handle JavaScript files (.js, .mjs)
            // Clear the require cache to ensure fresh imports
            delete require.cache[require.resolve(configPath)];
            config = require(configPath);
        }

        // Handle default exports
        if (config && typeof config === 'object' && config.default) {
            config = config.default;
        }
        
        // Try to get resolveConfig for this specific project
        const resolveConfig = tryImportResolveConfig(configPath);
        
        // If we have tailwindcss available, resolve the full config with defaults
        if (resolveConfig && config) {
            try {
                const resolvedConfig = resolveConfig(config);
                const resolvedTheme = resolvedConfig.theme || {};
                
                return {
                    colors: resolvedTheme.colors || {},
                    spacing: resolvedTheme.spacing || {},
                    fontSize: resolvedTheme.fontSize || {},
                    fontFamily: resolvedTheme.fontFamily || {},
                    fontWeight: resolvedTheme.fontWeight || {},
                    borderRadius: resolvedTheme.borderRadius || {},
                    boxShadow: resolvedTheme.boxShadow || {},
                    screens: resolvedTheme.screens || {},
                    extend: config.theme?.extend || {},
                    // Add some additional useful theme properties
                    lineHeight: resolvedTheme.lineHeight || {},
                    letterSpacing: resolvedTheme.letterSpacing || {},
                    maxWidth: resolvedTheme.maxWidth || {},
                    minWidth: resolvedTheme.minWidth || {},
                    zIndex: resolvedTheme.zIndex || {},
                    opacity: resolvedTheme.opacity || {},
                    scale: resolvedTheme.scale || {},
                    rotate: resolvedTheme.rotate || {},
                    translate: resolvedTheme.translate || {},
                    // Flag to indicate this was fully resolved
                    _resolved: true
                };
            } catch (resolveError) {
                console.error('Warning: Could not resolve full Tailwind config:', resolveError.message);
                // Fall back to basic extraction
            }
        }
        
        // Fallback: Extract theme from config without full resolution
        const theme = config.theme || {};
        
        // Return the theme object with basic structure
        return {
            colors: theme.colors || {},
            spacing: theme.spacing || {},
            fontSize: theme.fontSize || {},
            fontFamily: theme.fontFamily || {},
            fontWeight: theme.fontWeight || {},
            borderRadius: theme.borderRadius || {},
            boxShadow: theme.boxShadow || {},
            screens: theme.screens || {},
            extend: theme.extend || {},
            _resolved: false
        };
        
    } catch (error) {
        // If there's an error, return a basic structure with the error
        return {
            error: error.message,
            colors: {},
            spacing: {},
            fontSize: {},
            fontFamily: {},
            fontWeight: {},
            borderRadius: {},
            boxShadow: {},
            screens: {},
            extend: {},
            _resolved: false
        };
    }
}

async function parseTypeScriptConfig(configPath) {
    try {
        // Read the TypeScript file content
        let content = fs.readFileSync(configPath, 'utf8');
        
        // More comprehensive TypeScript-to-JavaScript transformation
        let jsContent = content;
        
        // Remove type imports (handle various import styles)
        jsContent = jsContent.replace(/import\s+type\s+\{[^}]*\}\s+from\s+["'][^"']*["'];?\s*/g, '');
        jsContent = jsContent.replace(/import\s+type\s+[^;]+;?\s*/g, '');
        
        // Remove type annotations from variable declarations
        jsContent = jsContent.replace(/:\s*Config\s*=/g, ' =');
        jsContent = jsContent.replace(/:\s*[A-Z][a-zA-Z0-9<>[\]|&\s]*(?=\s*[=,}])/g, '');
        
        // Handle export default
        jsContent = jsContent.replace(/export\s+default\s+(\w+);?\s*$/, 'module.exports = $1;');
        
        // Remove any remaining export statements
        jsContent = jsContent.replace(/export\s+/g, '');
        
        // Create a temporary file to execute the transformed content
        const tempFile = path.join(os.tmpdir(), `tailwind_temp_${Date.now()}.js`);
        
        try {
            // Write the transformed content to temp file
            fs.writeFileSync(tempFile, jsContent);
            
            // Clear require cache and load the config
            delete require.cache[require.resolve(tempFile)];
            const config = require(tempFile);
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
            
            return config;
            
        } catch (execError) {
            // Clean up temp file on error
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            
            // If execution failed, try manual object extraction
            return extractConfigManually(content);
        }
        
    } catch (error) {
        throw new Error(`TypeScript parsing failed: ${error.message}`);
    }
}

function extractConfigManually(content) {
    try {
        // Try to find the theme object specifically
        const themeMatch = content.match(/theme\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/s);
        
        if (themeMatch) {
            const themeContent = `{${themeMatch[1]}}`;
            
            // Clean up the theme content to be JavaScript-compatible
            let cleanTheme = themeContent
                .replace(/["']([^"']+)["']\s*:/g, '$1:') // Remove quotes from object keys
                .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
            
            // Try to safely evaluate the theme object
            const themeEval = new Function(`
                "use strict";
                // Common utilities that might be in theme
                const rem = (px) => px + 'rem';
                const px = (val) => val + 'px';
                
                return ${cleanTheme};
            `);
            
            const theme = themeEval();
            return { theme };
        }
        
        // If no theme found, try to extract colors specifically
        const colorsMatch = content.match(/colors\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/s);
        if (colorsMatch) {
            const colorsContent = `{${colorsMatch[1]}}`;
            const colorsEval = new Function(`return ${colorsContent};`);
            const colors = colorsEval();
            return { theme: { colors } };
        }
        
        throw new Error('Could not extract config from TypeScript file');
        
    } catch (error) {
        throw new Error(`Manual extraction failed: ${error.message}`);
    }
}

// Main execution
async function main() {
    const configPath = process.argv[2];
    
    if (!configPath) {
        console.error('Usage: node tailwind_parser.js <path_to_tailwind_config>');
        process.exit(1);
    }
    
    try {
        const result = await parseConfig(configPath);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(JSON.stringify({
            error: error.message,
            colors: {},
            spacing: {},
            fontSize: {},
            fontFamily: {},
            fontWeight: {},
            borderRadius: {},
            boxShadow: {},
            screens: {},
            extend: {},
            _resolved: false
        }));
    }
}

// Only run if this script is called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { parseConfig };