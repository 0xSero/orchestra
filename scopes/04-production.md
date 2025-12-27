# Scope 04: Production Readiness

**Branch:** `v0.3.7`
**Status:** Not Started
**Prerequisites:** `03-integration` must be complete

---

## Objective

Prepare the system for production release:
- Package as a bun package
- Clean and document the bun orchestra plugin
- Polish README and documentation
- Enable users to use frontend and backend via simple terminal commands

---

## Task Checklist

### Phase 1: Package Structure

- [ ] **1.1** Configure package.json for npm/bun publishing
- [ ] **1.2** Set up proper exports map
- [ ] **1.3** Configure bin entries for CLI
- [ ] **1.4** Set up bundling for distribution
- [ ] **1.5** Test package installation locally

### Phase 2: Bun Orchestra Plugin

- [ ] **2.1** Clean plugin code structure
- [ ] **2.2** Document plugin API
- [ ] **2.3** Create plugin README
- [ ] **2.4** Add usage examples
- [ ] **2.5** Test plugin in isolation

### Phase 3: CLI Interface

- [ ] **3.1** Design CLI command structure
- [ ] **3.2** Implement `opencode start` command
- [ ] **3.3** Implement `opencode stop` command
- [ ] **3.4** Implement `opencode status` command
- [ ] **3.5** Implement `opencode config` command
- [ ] **3.6** Add help text for all commands
- [ ] **3.7** Add version command

### Phase 4: Documentation

- [ ] **4.1** Update main README.md
  - [ ] Installation instructions
  - [ ] Quick start guide
  - [ ] Configuration reference
  - [ ] CLI command reference
- [ ] **4.2** Create CONTRIBUTING.md
- [ ] **4.3** Create API documentation
- [ ] **4.4** Create plugin development guide
- [ ] **4.5** Add code examples
- [ ] **4.6** Create troubleshooting guide

### Phase 5: User Experience

- [ ] **5.1** First-run setup wizard
- [ ] **5.2** Configuration validation
- [ ] **5.3** Helpful error messages
- [ ] **5.4** Progress indicators
- [ ] **5.5** Graceful shutdown handling

### Phase 6: Distribution

- [ ] **6.1** Set up GitHub releases
- [ ] **6.2** Configure npm publishing
- [ ] **6.3** Create release checklist
- [ ] **6.4** Set up changelog automation
- [ ] **6.5** Create installation script

### Phase 7: Quality Assurance

- [ ] **7.1** Test fresh installation
- [ ] **7.2** Test upgrade path
- [ ] **7.3** Test on different OS (macOS, Linux, Windows)
- [ ] **7.4** Test with different bun versions
- [ ] **7.5** Security audit

---

## CLI Commands

```bash
# Start the system
opencode start [--port 3000] [--config path/to/config]

# Stop the system
opencode stop

# Check status
opencode status

# Configure
opencode config set <key> <value>
opencode config get <key>
opencode config list

# Version
opencode --version

# Help
opencode --help
opencode <command> --help
```

---

## Package Configuration

### package.json
```json
{
  "name": "opencode-boomerang",
  "version": "0.3.7",
  "bin": {
    "opencode": "./dist/cli.js"
  },
  "exports": {
    ".": "./dist/index.js",
    "./orchestra": "./dist/orchestra/index.js",
    "./app": "./dist/app/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ]
}
```

---

## README Structure

```markdown
# OpenCode Boomerang

[Badges]

## Overview
Brief description

## Features
- Feature 1
- Feature 2

## Installation
npm/bun install commands

## Quick Start
3-step getting started

## Configuration
Config options

## CLI Reference
Command list

## Contributing
Link to CONTRIBUTING.md

## License
```

---

## Verification Checklist

Before marking this scope complete:

```bash
# 1. Package installs cleanly
npm pack && npm install ./opencode-boomerang-0.3.7.tgz

# 2. CLI works
opencode --version
opencode start
opencode status
opencode stop

# 3. Documentation complete
# All sections written
# All links work
# All examples run

# 4. Tests pass
bun test

# 5. Build succeeds
bun run build

# 6. No security issues
bun audit
```

---

## Release Checklist

- [ ] Version bumped in all package.json files
- [ ] CHANGELOG.md updated
- [ ] All tests passing
- [ ] Documentation reviewed
- [ ] Package tested locally
- [ ] GitHub release created
- [ ] npm package published
- [ ] Announcement prepared

---

## Output

Upon completion:
1. Create task files for each production task
2. Publish package to npm
3. Create GitHub release
4. Update this file's status to "Complete"
5. Tag final release as `v0.3.7`
6. Celebrate! 🎉
