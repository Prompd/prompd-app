# Prompd Video Demo Plan - Google Startup Program

## Overview

**Purpose**: Demonstrate Prompd's core value proposition for Google Startup Program application
**Target Audience**: Program reviewers, investors, technical evaluators
**Total Videos**: 4
**Estimated Total Runtime**: 5-7 minutes

---

## Pre-Recording Checklist

### Environment Setup
- [ ] Clean install of Prompd desktop app (or fresh browser session)
- [ ] Backend running locally or connected to production
- [ ] Registry accessible (prompdhub.ai)
- [ ] Test user account with some sample projects
- [ ] API keys configured (OpenAI and/or Anthropic)
- [ ] Screen resolution: 1920x1080 minimum (2560x1440 preferred)
- [ ] Close unnecessary apps, disable notifications
- [ ] Clear any personal/sensitive data from view

### Recording Software
- [ ] OBS Studio (free) or Camtasia/ScreenFlow
- [ ] Cursor highlighter plugin (optional but recommended)
- [ ] Test recording to verify audio/video quality
- [ ] Set output format: MP4, H.264, 60fps

### Assets to Prepare
- [ ] Sample .prmd files for editing demos
- [ ] Sample workspace folder with multiple files
- [ ] Context files (CSV, PDF, or text) for execution demo
- [ ] Package to demonstrate installation

---

## Video 1: First Impressions

**Duration**: 60-90 seconds
**Goal**: Show the professional IDE experience and ease of getting started

### Scenes

| # | Scene | Duration | What to Show | Notes |
|---|-------|----------|--------------|-------|
| 1.1 | App Launch | 5s | Desktop app opening with logo | Clean, professional first impression |
| 1.2 | Sign In | 10s | Click "Sign In", OAuth flow completes | Shows Clerk integration |
| 1.3 | Welcome State | 5s | Empty editor with sidebar panels visible | Highlight the IDE-like layout |
| 1.4 | Open Folder | 10s | File > Open Folder, select workspace | Show native file dialog |
| 1.5 | File Explorer | 10s | Navigate file tree, click .prmd file | Show sidebar file browser |
| 1.6 | Editor Opens | 15s | Code view with syntax highlighting | Scroll through, show frontmatter + body |
| 1.7 | View Toggle | 15s | Switch Code > Design > Wizard views | Quick tour of each view |
| 1.8 | Activity Bar | 10s | Click Explorer, Packages, Chat, Git icons | Show different panels |

### Recording Notes
- Start with app already installed
- Have a workspace folder ready with 3-4 .prmd files
- Move cursor slowly between elements
- Pause briefly on each view mode

### Status
- [ ] Script finalized
- [ ] Assets prepared
- [ ] Recording complete
- [ ] Editing complete
- [ ] Final review

---

## Video 2: AI-Powered Creation

**Duration**: 90-120 seconds
**Goal**: Demonstrate the AI chat panel and prompt generation capabilities

### Scenes

| # | Scene | Duration | What to Show | Notes |
|---|-------|----------|--------------|-------|
| 2.1 | Open Chat Panel | 5s | Click AI Chat icon in activity bar | Panel slides open |
| 2.2 | Mode Selector | 10s | Show the 4 modes: Generate, Explore, Edit, Discuss | Hover each to show description |
| 2.3 | Generate Mode | 40s | Type: "Create a customer support prompt that analyzes sentiment and suggests responses" | Show AI generating complete .prmd |
| 2.4 | Preview Output | 15s | Review generated prompt in preview | Scroll through metadata and body |
| 2.5 | Accept & Open | 10s | Click to accept, file opens in editor | Show smooth transition |
| 2.6 | Explore Mode | 30s | Switch to Explore, search "code review" | Show registry search results |
| 2.7 | Package Details | 15s | Click a result, view package info | Show metadata, versions, description |

### Recording Notes
- Have a good prompt description ready to type (or paste)
- Wait for AI response to complete before moving on
- Show the loading states briefly
- Registry should have some packages to find

### Status
- [ ] Script finalized
- [ ] Assets prepared
- [ ] Recording complete
- [ ] Editing complete
- [ ] Final review

---

## Video 3: Professional Editing

**Duration**: 90-120 seconds
**Goal**: Show the powerful editing features and IntelliSense

### Scenes

| # | Scene | Duration | What to Show | Notes |
|---|-------|----------|--------------|-------|
| 3.1 | Code View | 10s | Open a .prmd file in code view | Show Monaco editor |
| 3.2 | IntelliSense - Package | 20s | Type `@` in using section, show autocomplete | Live registry search appearing |
| 3.3 | IntelliSense - Params | 15s | Type `{` in body, show parameter suggestions | Context-aware completions |
| 3.4 | Hover Info | 10s | Hover over package reference | Show metadata tooltip |
| 3.5 | Snippets | 10s | Type `!prompd` to trigger snippet | Show template expansion |
| 3.6 | Design View | 20s | Switch to Design, edit parameters visually | Add a parameter, set type |
| 3.7 | Section Manager | 15s | Add a new section (context or system) | Show section adder component |
| 3.8 | Validation | 10s | Show error indicators, hover for details | Red underlines with messages |
| 3.9 | Wizard View | 15s | Quick tour of guided wizard steps | Step-by-step interface |

### Recording Notes
- Use a complex .prmd file with parameters
- Have registry packages available for autocomplete
- Intentionally create a validation error to show diagnostics
- Move through wizard steps without completing

### Status
- [ ] Script finalized
- [ ] Assets prepared
- [ ] Recording complete
- [ ] Editing complete
- [ ] Final review

---

## Video 4: Execute & Package

**Duration**: 90-120 seconds
**Goal**: Show execution workflow and package management

### Scenes

| # | Scene | Duration | What to Show | Notes |
|---|-------|----------|--------------|-------|
| 4.1 | Create Execution Tab | 10s | Right-click file > Execute, or use F5 | Execution tab opens |
| 4.2 | Parameter Inputs | 15s | Fill in parameter values | Show type-aware inputs |
| 4.3 | Context Section | 15s | Add context files (drag or browse) | Show file selection |
| 4.4 | Provider Selection | 10s | Select OpenAI/Anthropic from dropdown | Show model options |
| 4.5 | Cost Estimation | 10s | Show token count and estimated cost | Pricing display |
| 4.6 | Execute | 20s | Click Execute, show streaming response | Real LLM response coming in |
| 4.7 | Results | 10s | Review output, token usage stats | Show metadata panel |
| 4.8 | Package Panel | 10s | Open Packages panel, search | Show registry browser |
| 4.9 | Install Package | 15s | Click install on a package | Show installation flow |
| 4.10 | Create Package | 10s | Brief mention of Package > Create | Show modal (don't complete) |

### Recording Notes
- Have API keys configured and working
- Use a simple prompt that executes quickly
- Prepare context files in workspace
- Have a package ready to install from registry

### Status
- [ ] Script finalized
- [ ] Assets prepared
- [ ] Recording complete
- [ ] Editing complete
- [ ] Final review

---

## Post-Production

### Editing Checklist
- [ ] Trim dead time and long pauses
- [ ] Speed up slow sections (2x where appropriate)
- [ ] Add zoom/focus on key UI elements (optional)
- [ ] Add transitions between scenes (simple cuts or fades)
- [ ] Export at 1080p or 4K

### Audio Options

**Option A: No Voiceover**
- Add text callouts/annotations
- Use captions for key actions
- Background music (subtle, royalty-free)

**Option B: Voiceover**
- Write script after recording video
- Record separately, sync in post
- Keep narration concise and technical

**Option C: Hybrid**
- Text callouts for most content
- Brief voiceover for intro/outro only

### Final Output
- [ ] Video 1: `prompd-demo-01-first-impressions.mp4`
- [ ] Video 2: `prompd-demo-02-ai-creation.mp4`
- [ ] Video 3: `prompd-demo-03-professional-editing.mp4`
- [ ] Video 4: `prompd-demo-04-execute-package.mp4`
- [ ] Combined: `prompd-demo-full.mp4` (optional)

---

## Key Messages to Convey

1. **Professional IDE** - Not just a text editor, a full development environment
2. **AI-Native** - Built-in AI assistance for creation and exploration
3. **Package Ecosystem** - Reusable, shareable prompt components
4. **Multi-Platform** - Desktop app + web + CLI
5. **Cost Transparency** - Token tracking and pricing visibility
6. **Developer-Friendly** - IntelliSense, validation, git integration

---

## Timeline

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Plan finalized | | [ ] |
| Assets prepared | | [ ] |
| Video 1 recorded | | [ ] |
| Video 2 recorded | | [ ] |
| Video 3 recorded | | [ ] |
| Video 4 recorded | | [ ] |
| Post-production | | [ ] |
| Final review | | [ ] |
| Submitted | | [ ] |

---

## Notes & Ideas

_Add notes as you progress through recording:_

-
-
-



For demo videos like this, here's what I'd recommend:
Recording Software
Best free option: OBS Studio
Free, professional quality
Can record at 60fps, 1080p or 4K
Add cursor highlighting with a plugin or use built-in mouse cursor settings
Paid alternatives:
Camtasia - Built-in editing, cursor effects, callouts
ScreenFlow (Mac) - Smooth, polished output
Recording Settings
Setting	Recommended Value
Resolution	1920x1080 (1080p) or 2560x1440
Frame rate	60fps (smoother UI interactions)
Format	MP4, H.264 codec
Audio	None during recording (add in post)
Bitrate	15-25 Mbps for crisp text
Cursor Highlighting
This is important for viewers to follow along:
Windows: Use "Mouse Pointer Highlight" or "PointerFocus"
OBS Plugin: "Highlight Mouse Cursor"
Yellow circle that follows cursor works well
Recording Tips
Scale your UI to 125% - Makes text readable on video
Use a clean theme - Dark mode often looks better on video
Slow down - Move cursor deliberately, pause on key elements
Record in chunks - One scene at a time, easier to redo mistakes
No audio during recording - Add voiceover/music in post (more control)
Post-Production
Simple free editor: DaVinci Resolve (professional, free)
Add text callouts pointing to UI elements
Speed up slow sections (1.5-2x)
Add subtle transitions between scenes
Background music at 10-15% volume (royalty-free from YouTube Audio Library)
Output Format for Google
MP4, H.264
1080p minimum (4K if you have it)
Under 100MB per video if uploading directly
Want me to create a more detailed step-by-step checklist for setting up OBS specifically?
