export type Template = { id: string; name: string; content: string }

export const templates: Template[] = [
  {
    id: 'blank',
    name: 'Blank',
    content: `---
id: new-prompt
name: New Prompt
version: 0.1.0
description: Describe your prompt
parameters:
  - name: topic
    type: string
    required: true
---

# User
Write about {topic}.
`
  },
  {
    id: 'get-user-info',
    name: 'Get User Info',
    content: `---
id: get-user-info
name: Get User Info
version: 1.0.0
description: Example prompt
parameters:
  - name: include_roles
    type: boolean
    default: true
---

# System
You are a safe API assistant.

# User
Return the current user's profile. Include roles: {include_roles}.
`
  }
]

