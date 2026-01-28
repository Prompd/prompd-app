prompd compile .\src\prompts\team-project-planner.prmd -o team-project-planner-result.md -p project_name="prompdhub.ai" -p team_roles='["lead_engineer","qa"]'

prompd compile .\src\prompts\package-inheritance.prmd -o package-inheritance-result.md -p domain=prompdhub.ai -p topic=prompdhub.ai

prompd compile .\src\prompts\api-development.prmd -o api-development-result.md -p endpoint_name="Prompd Test"

prompd compile .\src\prompts\base-prompt.prmd -o base-prompt-result.md

prompd compile .\src\assistants\code-assistant.prmd -o code-assistant.md