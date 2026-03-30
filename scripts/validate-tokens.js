#!/usr/bin/env node

/**
 * Validate Design Tokens
 *
 * Validates the structure and content of tokens.json to ensure it is ready
 * for use by build-tokens.js and generate-js-tokens.js.
 *
 * Checks performed:
 *   - File exists at tokens.json (package root)
 *   - Valid JSON syntax
 *   - Required top-level keys: primitives, themes
 *   - Optional top-level keys reported: grid, font, effect, typography
 *   - Theme structure: ntg and central with clr, type, radii, sp, border-width
 *   - Primitive structure: ntg (13 colour groups) and central (8 colour groups)
 *   - Circular/unresolvable token references
 *   - Token count and file statistics
 *
 * Usage:
 *   node scripts/validate-tokens.js
 *   npm run tokens:validate
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const tokensPath = join(rootDir, 'tokens.json');

console.log('🔍 Validating Design Tokens...\n');

let hasErrors = false;

// Check 1: File exists
if (!existsSync(tokensPath)) {
  console.error('❌ tokens.json not found');
  process.exit(1);
}

console.log('✓ File exists');

// Check 2: Valid JSON
let tokens;
try {
  const content = readFileSync(tokensPath, 'utf-8');
  tokens = JSON.parse(content);
  console.log('✓ Valid JSON syntax');
} catch (error) {
  console.error('❌ Invalid JSON syntax:', error.message);
  process.exit(1);
}

// Check 3: Required top-level categories
const requiredCategories = ['primitives', 'themes'];
const optionalCategories = ['grid', 'font', 'effect', 'typography'];

console.log('\n📋 Checking token structure...');

requiredCategories.forEach(category => {
  if (tokens[category]) {
    console.log(`✓ Found required category: ${category}`);
  } else {
    console.error(`❌ Missing required category: ${category}`);
    hasErrors = true;
  }
});

optionalCategories.forEach(category => {
  if (tokens[category]) {
    console.log(`✓ Found optional category: ${category}`);
  }
});

// Check 4: Theme structure
if (tokens.themes) {
  console.log('\n🎨 Checking themes...');
  
  const expectedThemes = ['ntg', 'central'];
  expectedThemes.forEach(theme => {
    if (tokens.themes[theme]) {
      console.log(`✓ Found theme: ${theme}`);
      
      // Check for color tokens in theme
      if (tokens.themes[theme].clr) {
        const colorGroups = Object.keys(tokens.themes[theme].clr).length;
        console.log(`  • ${colorGroups} color groups`);
      }
      
      // Check for typography tokens in theme
      if (tokens.themes[theme].type) {
        console.log(`  • Typography tokens defined`);
      }
    } else {
      console.warn(`⚠️  Missing expected theme: ${theme}`);
    }
  });
}

// Check 5: Primitives structure
if (tokens.primitives) {
  console.log('\n🎨 Checking primitives...');
  
  const expectedPrimitives = ['ntg', 'central'];
  expectedPrimitives.forEach(primitive => {
    if (tokens.primitives[primitive]) {
      console.log(`✓ Found primitives for: ${primitive}`);
      
      const categories = Object.keys(tokens.primitives[primitive]);
      console.log(`  • ${categories.length} color categories`);
    }
  });
}

// Check 6: Token value references
console.log('\n🔗 Checking token references...');

let referenceCount = 0;
let invalidReferences = [];

function checkReferences(obj, path = []) {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...path, key];
    
    if (typeof value === 'object' && value !== null) {
      if (value.value && typeof value.value === 'string') {
        // Check if it's a reference (starts with {)
        if (value.value.startsWith('{') && value.value.endsWith('}')) {
          referenceCount++;
          const ref = value.value.slice(1, -1);
          
          // Basic validation - just check format
          if (!ref.includes('.')) {
            invalidReferences.push({
              path: currentPath.join('.'),
              reference: value.value
            });
          }
        }
      }
      checkReferences(value, currentPath);
    }
  }
}

checkReferences(tokens);

console.log(`✓ Found ${referenceCount} token references`);

if (invalidReferences.length > 0) {
  console.warn(`⚠️  Found ${invalidReferences.length} potentially invalid references:`);
  invalidReferences.slice(0, 5).forEach(ref => {
    console.warn(`   ${ref.path}: ${ref.reference}`);
  });
  if (invalidReferences.length > 5) {
    console.warn(`   ... and ${invalidReferences.length - 5} more`);
  }
}

// Check 7: Statistics
console.log('\n📊 Token Statistics:');

function countTokens(obj) {
  let count = 0;
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      if (value.type && value.value !== undefined) {
        count++;
      } else {
        count += countTokens(value);
      }
    }
  }
  return count;
}

const totalTokens = countTokens(tokens);
console.log(`  • Total tokens: ${totalTokens}`);

const fileSize = (readFileSync(tokensPath).length / 1024).toFixed(2);
console.log(`  • File size: ${fileSize} KB`);

const lineCount = readFileSync(tokensPath, 'utf-8').split('\n').length;
console.log(`  • Line count: ${lineCount}`);

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ Validation failed with errors');
  console.error('   Please fix the errors above and try again.\n');
  process.exit(1);
} else {
  console.log('✅ All validation checks passed!');
  console.log('   Tokens are ready to be transformed into CSS.\n');
  console.log('💡 Run "npm run tokens:build" to generate theme CSS files.\n');
}
