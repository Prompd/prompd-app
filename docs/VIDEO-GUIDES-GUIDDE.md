# Prompd Demo Videos - Guidde Recording Guide (v7)

> **How to use this document**: Follow each numbered step during recording. Guidde will auto-capture your clicks and generate descriptions. After recording, refine the AI-generated text using the suggested descriptions below.

> **Guidde Tips**:
> - Each click/action becomes a step automatically
> - Use **Magic Mic** to narrate as you go (Guidde transcribes and polishes)
> - Add **Pan & Zoom** in post-editing to highlight important UI elements
> - **Blur** any sensitive data (API keys, personal info) with one click
> - Export as **MP4** for GCP submission

> **GCP Requirements**: Demonstrate the complete developer workflow: **PUBLISH** (create packages), **DISCOVER** (find packages), and **INTEGRATE** (use packages in prompts).

> **Demo Workspace**: Use `@prompd/demo-prompts` package located at `prompds/prompts/@prompd/demo-prompts/` which contains:
> - `greeting.prmd` - Quick greeting generator (name, tone, emoji params)
> - `summarize.prmd` - Text summarizer (text, length, style params)
> - `translate.prmd` - Language translator (text, language, formality params)
> - `prompd.json` - Ready-to-build package manifest

---

## Guidde Capture Settings

When starting each recording in Guidde, use these settings:

| Video | Description (150 char max) | Capture Type | Magic Mic | Language |
|-------|---------------------------|--------------|-----------|----------|
| 1 | Prompd IDE first impressions - onboarding wizard and professional interface tour | Product Demo | On | English (US) |
| 2 | Creating AI prompts with Prompd's intelligent assistant - generate and discover packages | Product Demo | On | English (US) |
| 3 | Professional editing in Prompd - IntelliSense, autocomplete, and package integration | Product Demo | On | English (US) |
| 4 | Execute prompts and build packages - from parameters to registry-ready .pdpkg | Product Demo | On | English (US) |

**Capture Type**: Always use "Product Demo" - we're demonstrating software functionality

**Magic Mic**: Keep enabled - Guidde generates AI voiceover that you can refine in post-editing

**Recording Tips**:
- Guidde captures on clicks/actions - no movement = no capture
- Move deliberately between UI elements
- Pause briefly on important areas before clicking
- Click on elements you want to highlight even if just to show them
- Scroll slowly through content you want to showcase

---

## Video 1: First Impressions & Onboarding

**Target Duration**: 90-120 seconds (~25-30 steps)
**Goal**: Show professional IDE experience, onboarding wizard, and ease of getting started
**GCP Focus**: Establish context for the platform

### Pre-Recording Setup
- [ ] Prompd app closed
- [ ] Desktop clean with app icon visible
- [ ] Clear local storage/app data (to trigger fresh onboarding)
- [ ] Demo workspace folder ready (`@prompd/demo-prompts`)
- [ ] Signed out (to show sign-in flow)

---

### Recording Steps

| Step | Action | Suggested Description | Pan/Zoom | Notes |
|------|--------|----------------------|----------|-------|
| 1 | Double-click Prompd icon on desktop | Launch the Prompd application | Zoom to icon | Deliberate double-click |
| 2 | Wait for app to load | The app opens with a professional splash screen | - | Let branding show ~2s |
| 3 | View Welcome screen | First-time setup wizard welcomes new users | Zoom to wizard | Show clean welcome UI |
| 4 | Click "Sign In" button | Secure authentication with industry-standard OAuth | - | - |
| 5 | Complete OAuth sign-in | Sign in using your preferred identity provider | - | Use saved credentials |
| 6 | Wait for redirect to app | Authentication complete - returning to Prompd | - | Brief pause |
| 7 | View API key setup | First step prompts for provider configuration | Zoom to wizard | Shows API key input |
| 8 | Paste API key | Enter your provider API key | - | Paste from clipboard |
| 9 | Click Next or Continue | Save credentials and proceed | - | - |
| 10 | View template selection | Choose from pre-built templates or generate with AI | Zoom to wizard | Shows template options |
| 11 | Select a template | Pick a template to start with | - | Click a template card |
| 12 | Click "Create Prompt" or Finish | Complete the wizard and create your prompt | - | - |
| 13 | Wait for editor to open | Your new prompt opens in the editor | Zoom to editor | Show generated code |
| 14 | Hover over provider dropdown in header | Choose from multiple AI providers | Zoom to header | Show provider options |
| 15 | Click Explorer icon in activity bar | Access the file explorer | Zoom to activity bar | First icon (Files) |
| 16 | Click "Open Folder" button in explorer | Open an existing project folder | - | Button in sidebar |
| 17 | Navigate to demo-prompts folder | Select the demo workspace | - | @prompd/demo-prompts |
| 18 | Click Open/Select | Load the workspace into Prompd | - | - |
| 19 | Wait for file explorer to populate | Project-based organization with full file tree | Zoom to explorer | Show .prmd files |
| 20 | Click greeting.prmd to open | Open a demo prompt file | - | - |
| 21 | Wait for editor to load | Visual Design view opens by default | Zoom to editor | Hold ~2s |
| 22 | Click "Code" button in header | Switch to code view | Zoom to toggle | Code icon |
| 23 | Wait for Code view | Full syntax highlighting powered by Monaco | - | Let viewer see code ~3s |
| 24 | Click Packages icon in activity bar | Access the package registry browser | Zoom to activity bar | Package icon |
| 25 | Wait for Packages panel | Browse and discover packages from the registry | - | Hold ~2s |
| 26 | Click AI Assistant icon in activity bar | Open the built-in AI assistant | - | Prompd logo icon |
| 27 | Wait for Chat panel | AI-powered assistance for prompt creation | - | Hold ~2s |

**Estimated Steps**: ~27

### Post-Recording Checklist
- [ ] Add intro title card: "Prompd - Professional Prompt IDE"
- [ ] Add Pan/Zoom to onboarding wizard (steps 7-12)
- [ ] Add Pan/Zoom to header area (step 14)
- [ ] Blur API key input (step 8)
- [ ] Add Pan/Zoom to file explorer (step 16)
- [ ] Blur any visible API keys or personal data
- [ ] Select voice: Professional, clear (suggest: English US - Male/Female)
- [ ] Add brand kit (logo, colors)

---

## Video 2: AI-Powered Creation

**Target Duration**: 90-120 seconds (~20-25 steps)
**Goal**: Demonstrate AI chat panel and prompt generation
**GCP Focus**: DISCOVER - Show package discovery via chat

### Pre-Recording Setup
- [ ] App open with workspace loaded
- [ ] Chat panel closed initially
- [ ] Practice the conversation flow
- [ ] Registry accessible for package search
- [ ] Have at least one package in registry to find

---

### Recording Steps

| Step | Action | Suggested Description | Pan/Zoom | Notes |
|------|--------|----------------------|----------|-------|
| 1 | Click AI Assistant icon in activity bar | Open the AI Assistant panel | - | Prompd logo icon |
| 2 | Wait for Chat panel to open | The AI Assistant is ready to help | Zoom to chat | Let animation complete |
| 3 | View the chat interface | Unified AI agent for all tasks | - | Show the input area |
| 4 | Click into chat input | Start typing your request | - | - |
| 5 | Type request | Type: "create a customer support sentiment analyzer" | - | Natural typing pace |
| 6 | Press Enter | Send the request to the AI | - | - |
| 7 | Wait for AI response | The AI asks smart follow-up questions | - | Hold ~3s to read |
| 8 | Click into chat input | Respond with your specifications | - | - |
| 9 | Type abbreviated params | Type: "message req, tone prof/friendly/empa, suggest_response def true" | - | Dev shorthand |
| 10 | Press Enter | The AI understands developer shorthand | - | - |
| 11 | Wait for AI to generate | Watch the complete .prmd file being generated | - | Hold ~10-12s |
| 12 | Scroll through AI response | Review the generated prompt structure | - | Show quality |
| 13 | Click "Accept" or preview button | Accept the generated prompt file | Zoom to button | - |
| 14 | Wait for new file to open | Instant file creation in the editor | Zoom to editor | Hold ~3s |
| 15 | Scroll through generated file | Review the quality of AI-generated content | - | - |
| 16 | Click back to Chat panel | Return to the AI Assistant | - | Click activity bar icon |
| 17 | Click into chat input | Search for packages | - | - |
| 18 | Type search query | Type: "find packages for code review" | - | GCP: DISCOVER |
| 19 | Press Enter | Search the registry for matching packages | - | - |
| 20 | Wait for search results | AI searches the package registry | - | Hold ~3s |
| 21 | View search results | Discover existing packages from the community | Zoom to results | GCP: Show cards |
| 22 | Click on a package result | View package details and versions | - | If clickable |
| 23 | Wait for package details | Package metadata, versions, and documentation | Zoom to details | Hold ~3s |

**Estimated Steps**: ~23

### Post-Recording Checklist
- [ ] Add Pan/Zoom to chat input (step 4)
- [ ] Add Pan/Zoom to AI response (step 11)
- [ ] Add Pan/Zoom to search results (step 21)
- [ ] Consider speeding up typing sections (1.5x)
- [ ] Ensure AI response is fully visible before moving on

---

## Video 3: Professional Editing

**Target Duration**: 90-120 seconds (~30-40 steps)
**Goal**: Show powerful editing features and IntelliSense
**GCP Focus**: INTEGRATE - Show using packages in prompts via `using:` section

### Pre-Recording Setup
- [ ] Open a .prmd file with multiple parameters already defined
- [ ] File should have a `using:` section (can be empty or with existing packages)
- [ ] Registry must be accessible for package autocomplete
- [ ] Prepare to intentionally create a validation error

---

### Recording Steps

| Step | Action | Suggested Description | Pan/Zoom | Notes |
|------|--------|----------------------|----------|-------|
| 1 | View editor with .prmd file | Monaco-powered editor with full syntax highlighting | Zoom to editor | Starting state |
| 2 | Scroll to `using:` section | Navigate to the package imports section | - | - |
| 3 | Click at end of `using:` line | Position cursor to add a new package | - | - |
| 4 | Press Enter for new line | Create space for a new package reference | - | - |
| 5 | Type "  - @" | Start typing a package reference | - | Two spaces, dash, @ |
| 6 | Wait for autocomplete | Live registry search shows available packages | Zoom to dropdown | GCP: INTEGRATE |
| 7 | Type "pro" to filter | Filter packages by typing | - | Show filtering |
| 8 | View filtered results | Easily integrate packages from the registry | - | Hold ~2s |
| 9 | Select a package from dropdown | Add the package to your prompt | - | Press Enter/Tab |
| 10 | View package added | Package reference added to using section | - | Hold ~2s |
| 11 | Scroll to prompt body | Navigate to the content section | - | - |
| 12 | Click to place cursor | Position cursor in the prompt body | - | - |
| 13 | Type "{" | Trigger parameter autocomplete | - | Single character |
| 14 | Wait for autocomplete | Parameter suggestions from your schema | Zoom to dropdown | - |
| 15 | Browse with arrow keys | View all available parameters | - | Show options |
| 16 | Press Escape | Dismiss autocomplete | - | - |
| 17 | Delete the { | Clean up | - | - |
| 18 | Scroll to using section | Return to package references | - | - |
| 19 | Hover over a package reference | View package metadata on hover | Zoom to tooltip | - |
| 20 | Wait for tooltip | Package details, version, and description | - | Hold ~3s |
| 21 | Scroll to top of file | Navigate to file beginning | - | - |
| 22 | Click at very beginning | Position cursor at start | - | - |
| 23 | Type "prompd" | Trigger code snippet autocomplete | - | Type at file start |
| 24 | Wait for snippet suggestion | Code snippets: prompd-basic, prompd-advanced | Zoom to suggestion | - |
| 25 | Select prompd-basic, press Tab | Expand the template snippet | - | - |
| 26 | View expanded snippet | Full template structure inserted | - | Hold ~2s |
| 27 | Press Ctrl+Z | Undo to restore original file | - | - |
| 28 | Click "Design" button in header | Switch to visual Design view | - | Palette icon |
| 29 | Scroll to parameters section | Navigate to parameter management | - | - |
| 30 | Click "Add Parameter" | Add a new parameter visually | - | - |
| 31 | Type name: "temperature" | Enter parameter name | - | - |
| 32 | Click type dropdown | Select parameter type | Zoom to dropdown | - |
| 33 | Select "number" | Choose number type | - | - |
| 34 | Check "required" checkbox | Mark parameter as required | - | - |
| 35 | View completed parameter | Visual parameter editing complete | - | Hold ~2s |
| 36 | Click "Code" button | Return to code view | - | Code icon |
| 37 | Find/create validation error | Introduce a syntax error | - | Delete required field |
| 38 | Wait for error underline | Real-time validation catches errors | Zoom to error | Red underline |
| 39 | Hover over error | View detailed error message | - | - |
| 40 | View error tooltip | Compiler error with fix suggestions | - | Hold ~3s |
| 41 | Press Ctrl+Z | Fix the error | - | - |
| 42 | View error cleared | Validation passes - ready to execute | - | Hold ~2s |

**Estimated Steps**: ~42

### Post-Recording Checklist
- [ ] Add Pan/Zoom to autocomplete dropdowns (steps 6, 14)
- [ ] Add Pan/Zoom to hover tooltip (step 19)
- [ ] Add Pan/Zoom to error underline (step 38)
- [ ] Blur any sensitive data visible in file content

---

## Video 4: Execute & Package

**Target Duration**: 90-120 seconds (~30-35 steps)
**Goal**: Show execution workflow and package creation using demo-prompts
**GCP Focus**: PUBLISH - Create and build a package for the registry

### Pre-Recording Setup
- [ ] Demo workspace open (`@prompd/demo-prompts`)
- [ ] `greeting.prmd` open in editor (fast execution)
- [ ] `prompd.json` already configured with all 3 demo files
- [ ] Sufficient API credits

---

### Recording Steps

| Step | Action | Suggested Description | Pan/Zoom | Notes |
|------|--------|----------------------|----------|-------|
| 1 | View editor with greeting.prmd | Starting with a demo prompt ready to execute | Zoom to editor | Show the simple structure |
| 2 | Click provider dropdown in header | Select your AI provider | Zoom to header | - |
| 3 | Wait for dropdown | View available providers | - | - |
| 4 | Select OpenAI or preferred provider | Choose your preferred AI provider | - | - |
| 5 | Click model dropdown | Select the AI model | - | Shows pricing |
| 6 | Select gpt-4o-mini | Choose a fast, affordable model | - | - |
| 7 | Click Execute button (Play icon) | Launch execution | Zoom to button | Green play button or F5 |
| 8 | Wait for execution tab | Execution interface opens in new tab | Zoom to tab | - |
| 9 | View parameter inputs | Type-aware input fields for parameters | Zoom to inputs | Show name, tone, emoji |
| 10 | Click "name" input | Enter the name parameter | - | - |
| 11 | Type "Sarah" | Enter a sample name | - | Quick typing |
| 12 | Click "tone" dropdown | Select the greeting tone | Zoom to dropdown | Shows enum options |
| 13 | Select "enthusiastic" | Choose an expressive tone | - | - |
| 14 | View "include_emoji" checkbox | Boolean parameter with default | - | Already checked |
| 15 | Click Execute button in tab | Run the prompt | Zoom to button | - |
| 16 | Wait for execution | Executing with your selected provider | - | Brief loading (~2-3s) |
| 17 | View response | See the generated greeting | Zoom to response | Fast response! |
| 18 | View stats section | Usage statistics: tokens, time, cost | Zoom to stats | ~50-100 tokens |
| 19 | Click on prompd.json in explorer | Open package configuration | - | GCP: PUBLISH |
| 20 | Wait for file to open | Package manifest loaded | - | - |
| 21 | Click "Design" button in header | Visual package builder interface | - | Palette icon |
| 22 | Wait for PrompdJsonDesignView | Package configuration made easy | Zoom to view | - |
| 23 | View project info fields | Package name: @prompd/demo-prompts | - | Hold ~2s |
| 24 | Scroll to main entry point | Set the primary prompt file | - | - |
| 25 | View entry point dropdown | greeting.prmd is set as main | Zoom to dropdown | Already configured |
| 26 | Scroll to file selection | Choose files to include | - | - |
| 27 | View selected files | All 3 demo prompts are included | - | greeting, summarize, translate |
| 28 | Scroll to ignore patterns | Configure exclusion patterns | - | - |
| 29 | View ignore patterns | *.log and .DS_Store excluded | - | Hold ~2s |
| 30 | Click Build button | Build the package | Zoom to button | - |
| 31 | Wait for build | Package building in progress | - | Brief wait |
| 32 | View BuildOutputPanel | Build status and package details | Zoom to panel | - |
| 33 | View build success | Package created successfully | - | Toast notification |
| 34 | View .pdpkg file | Package ready to publish to registry | Zoom to file | Final view |

**Estimated Steps**: ~34

### Post-Recording Checklist
- [ ] Add Pan/Zoom to header controls (steps 2, 5)
- [ ] Add Pan/Zoom to execution response (step 17)
- [ ] Add Pan/Zoom to build output (step 34)
- [ ] Blur any sensitive data in execution response

---

## Guidde Export Settings

### Recommended Export Settings
- **Format**: MP4 (for GCP submission)
- **Resolution**: 1080p (1920x1080)
- **Voice**: Professional English (US) voice
- **Speed**: 1x (normal) - let viewers follow along
- **Branding**: Include Prompd logo, remove Guidde watermark (Pro plan)

### Alternative Exports
- **GIF**: For quick social media previews
- **PDF**: For written documentation alongside videos

---

## Quick Reference: Step Description Themes

### Video 1: First Impressions & Onboarding
- Professional IDE experience
- First-time setup wizard
- Guided prompt creation
- Project-based organization
- Syntax highlighting
- Visual Design view
- Package registry access
- Built-in AI assistant

### Video 2: AI-Powered Creation (DISCOVER)
- AI Assistant panel
- Unified agent interface
- Smart follow-up questions
- Developer shorthand understanding
- Instant file creation
- Package registry search
- Discover existing packages

### Video 3: Professional Editing (INTEGRATE)
- Monaco-powered editor
- Live registry search
- Package integration
- Parameter suggestions
- Package metadata on hover
- Code snippets
- Visual parameter editing
- Real-time validation

### Video 4: Execute & Package (PUBLISH)
- Demo prompts execution
- Provider and model selection
- Parameter inputs (string, enum, boolean)
- Fast execution with gpt-4o-mini
- Usage statistics
- Visual package builder
- Package creation and build

---

## Guidde Recording Tips

1. **Don't rush** - Guidde captures every click; take your time
2. **Use Magic Mic** - Narrate as you go for better AI descriptions
3. **Pause on important screens** - Give Guidde time to capture
4. **One action per step** - Keeps steps clean and easy to follow
5. **Review AI descriptions** - Refine them using suggestions above
6. **Add Pan/Zoom in post** - Highlight key UI elements
7. **Blur sensitive data** - Use one-click blur for API keys

---

## GCP Submission Summary

These 4 videos demonstrate the complete developer workflow:

1. **Video 1** - Professional IDE overview (establishes credibility)
2. **Video 2** - **DISCOVER** packages via AI assistant and registry search
3. **Video 3** - **INTEGRATE** packages using `using:` section with autocomplete
4. **Video 4** - **PUBLISH** packages with visual builder and local build

**Estimated Total Runtime**: ~5-6 minutes (within GCP target)

---

## Guidde Workflow Summary

```
1. SETUP
   - Pre-recording checklist
   - Clear desktop, app ready

2. RECORD
   - Follow step-by-step actions
   - Use Magic Mic to narrate
   - Take your time

3. EDIT
   - Review AI-generated descriptions
   - Refine text using suggestions
   - Add Pan/Zoom effects
   - Blur sensitive data

4. BRAND
   - Add Prompd logo
   - Set brand colors
   - Remove watermark (Pro)

5. EXPORT
   - MP4 for GCP submission
   - 1080p resolution
   - Professional voice
```

---

*Document tailored for Guidde.com video creation workflow - v7*
