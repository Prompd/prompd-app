# Chat Modes Architecture

## Overview

The Prompd Editor AI Assistant supports 4 distinct conversation modes, each optimized for different user workflows. Mode configurations are served dynamically from the backend, allowing prompt updates without rebuilding the frontend.

## Architecture

### Backend (Configuration Server)
**Location**: `backend/src/prompts/modes/`

**Files**:
- `generate.json` - Generate mode config and system prompt
- `explore.json` - Explore mode config and system prompt
- `edit.json` - Edit mode config and system prompt
- `discuss.json` - Discuss mode config and system prompt

**API Endpoint**: `GET /api/chat-modes`

**Response Structure**:
```json
{
  "modes": {
    "generate": {
      "id": "generate",
      "label": "Generate",
      "icon": "🎯",
      "description": "Create new .prmd files from scratch",
      "systemPrompt": "...",
      "followUpStrategies": {...},
      "examples": [...]
    },
    "explore": {...},
    "edit": {...},
    "discuss": {...}
  },
  "version": "1.0.0",
  "lastUpdated": "2025-11-25T02:44:41.442Z"
}
```

### Frontend (Dynamic Loading)
**Location**: `frontend/src/modules/editor/AiChatPanel.tsx`

**Loading Strategy**:
1. Fetch chat modes from `/api/chat-modes` on component mount
2. Store in state: `chatModes` (full configs) and `modeConfigsArray` (UI data)
3. Fallback to `@prompd/react` constants if backend unavailable
4. System prompts are dynamically injected into LLM requests based on active mode

## The Four Modes

### 1. Generate Mode 🎯
**Purpose**: Create new custom .prmd files from scratch

**Behavior**:
- **Detailed requests** → Generate immediately
- **Vague requests** → Ask 1-3 clarifying questions
- **NO registry search** - This is for custom creation

**Example**:
```
User: "CSV analyzer with 5 parameters: csv_data, header_included, distinct, sort_column, sort_direction"
AI: "Perfect! I have all the details. Generating CSV analyzer now..."
[Generates immediately without asking questions]
```

**Key Rules**:
- Don't search registry (that's Explore mode)
- Minimize questions if request is clear
- Generate production-ready .prmd files
- Use kebab-case IDs, snake_case parameters

### 2. Explore Mode 📦
**Purpose**: Discover existing packages in the registry

**Behavior**:
- **ALWAYS search registry first**
- Extract 3-5 keywords from user request
- Present top results with details
- Suggest Generate mode if no matches

**Example**:
```
User: "I need help writing LinkedIn posts"
AI: [Searches with keywords: linkedin, post, social, professional, content]
AI: "I found 2 packages for LinkedIn content: @social/linkedin-pro and @marketing/social-suite..."
```

**Key Rules**:
- Extract good keywords (broad, relevant, 3-5 max)
- Present results clearly
- Help compare packages
- Redirect to Generate mode if needed

### 3. Edit Mode 🔧
**Purpose**: Modify and improve existing .prmd files

**Behavior**:
- **Requires open file** - Check before editing
- Propose changes before applying
- Use `edit-file` JSON structure
- Document all modifications

**Example**:
```
User: "Add a temperature parameter"
AI: "I'll add temperature (0.0-1.0, default 0.7) to control output randomness. Sound good?"
User: "Yes"
AI: [Applies edit-file JSON]
```

**Key Rules**:
- Require open .prmd file
- Ask before major changes
- Preserve working functionality
- Provide clear change summaries

### 4. Discuss Mode 💬
**Purpose**: Brainstorm ideas and explore possibilities

**Behavior**:
- **Conversational, not code-focused**
- Ask open-ended questions
- Explore trade-offs
- Build on user ideas
- Suggest modes when ready to build

**Example**:
```
User: "I'm thinking about creating prompts for my team"
AI: "That's great! What kind of work does your team do? Let's explore what types of prompts would be most valuable for them."
[Natural conversation, no rush to code]
```

**Key Rules**:
- Stay conversational
- Don't rush to file generation
- Help users think through ideas
- Suggest switching modes when appropriate

## Updating Prompts

To update mode behavior, simply edit the JSON files in `backend/src/prompts/modes/`:

1. Edit the JSON file (e.g., `generate.json`)
2. Update `systemPrompt`, `followUpStrategies`, or `examples`
3. Save the file
4. Restart backend (if needed)
5. Frontend will load new config on next page load

**No rebuild required!**

## Benefits of This Architecture

1. **Dynamic Updates**: Change AI behavior without rebuilding frontend
2. **Centralized Configuration**: All mode configs in one place
3. **Version Control**: Track prompt changes in git
4. **Testing**: Easy A/B testing of different prompts
5. **Fallback**: Uses `@prompd/react` constants if backend unavailable
6. **Extensibility**: Easy to add new modes or update existing ones

## Future Enhancements

- User-specific mode customization
- A/B testing different prompts
- Analytics on mode effectiveness
- Admin UI for editing mode configs
- Mode prompt versioning and rollback
