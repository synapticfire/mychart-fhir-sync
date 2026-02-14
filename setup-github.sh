#!/bin/bash
# Setup script to publish mychart-sync to GitHub
set -e

echo "🔧 Setting up mychart-sync for GitHub..."

# Remove old git if it exists
if [ -d ".git" ]; then
  echo "⚠️  Removing existing .git directory..."
  rm -rf .git
fi

# Initialize fresh repo
echo "📦 Initializing git repository..."
git init
git branch -M main

# Swap READMEs (use public version for GitHub)
if [ -f "README.md" ]; then
  mv README.md README-WORKSPACE.md
  echo "📝 Saved workspace README as README-WORKSPACE.md"
fi
if [ -f "README-GITHUB.md" ]; then
  mv README-GITHUB.md README.md
  echo "📝 Using public README.md for GitHub"
fi

# Verify .gitignore is present
if [ ! -f ".gitignore" ]; then
  echo "❌ ERROR: .gitignore not found! Aborting."
  exit 1
fi

# Check for sensitive files that should NOT be committed
echo "🔍 Checking for sensitive files..."
SENSITIVE_FILES=(.env epic-tokens.json)
for file in "${SENSITIVE_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "⚠️  WARNING: $file exists but is gitignored (safe)"
  fi
done

# Stage all files
echo "➕ Staging files..."
git add .

# Show what will be committed
echo ""
echo "📋 Files to be committed:"
git status --short

# Check for accidentally staged secrets
if git diff --cached --name-only | grep -E '(\.env$|epic-tokens\.json)'; then
  echo "❌ ERROR: Sensitive files are staged! Check .gitignore"
  exit 1
fi

# Commit
echo ""
echo "💾 Creating initial commit..."
git commit -m "Initial commit: MyChart FHIR sync with Snowflake

- Epic FHIR R4 OAuth2 client (SMART on FHIR)
- FHIR resource parsers (Appointment, Medication, Observation, Condition)
- Snowflake integration with Cortex embeddings
- Structured queries and semantic search
- Personal care assistant for family health coordination"

echo ""
echo "✅ Git repository initialized!"
echo ""
echo "📤 Next steps:"
echo "1. Create repo at https://github.com/new"
echo "   - Name: mychart-fhir-sync (or similar)"
echo "   - Public or Private: your choice"
echo "   - Don't initialize with README (we have one)"
echo ""
echo "2. Add remote and push:"
echo "   git remote add origin https://github.com/YOUR-USERNAME/REPO-NAME.git"
echo "   git push -u origin main"
echo ""
echo "3. Use GitHub URL for Epic app registration:"
echo "   https://github.com/YOUR-USERNAME/REPO-NAME"
echo ""
