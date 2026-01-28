@echo off
echo Setting up GCP Secrets for api-prompd-app
echo.
echo Make sure you're logged into gcloud and have the correct project selected.
echo Current project:
gcloud config get-value project
echo.

echo This script will prompt you for each secret value.
echo Press Ctrl+C to cancel at any time.
echo.
pause

:: MongoDB URI
echo.
echo === MongoDB URI ===
echo Enter your MongoDB Atlas connection string (mongodb+srv://...)
set /p MONGODB_URI="MONGODB_URI: "
echo %MONGODB_URI%| gcloud secrets create prompd-editor-mongodb-uri --data-file=- 2>nul || echo Secret may already exist, trying to add new version...
echo %MONGODB_URI%| gcloud secrets versions add prompd-editor-mongodb-uri --data-file=- 2>nul
echo Done.

:: JWT Secret (auto-generate)
echo.
echo === JWT Secret ===
echo Generating 256-bit JWT secret...
for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set JWT_SECRET=%%i
echo %JWT_SECRET%| gcloud secrets create prompd-editor-jwt-secret --data-file=- 2>nul || gcloud secrets versions add prompd-editor-jwt-secret --data-file=-
echo Done.

:: Encryption Secret (auto-generate)
echo.
echo === Encryption Secret ===
echo Generating 256-bit Encryption secret...
for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set ENCRYPTION_SECRET=%%i
echo %ENCRYPTION_SECRET%| gcloud secrets create prompd-editor-encryption-secret --data-file=- 2>nul || gcloud secrets versions add prompd-editor-encryption-secret --data-file=-
echo Done.

:: Clerk Secret
echo.
echo === Clerk Secret Key ===
echo Enter your Clerk secret key (sk_live_...)
set /p CLERK_SECRET="CLERK_SECRET_KEY: "
echo %CLERK_SECRET%| gcloud secrets create prompd-editor-clerk-secret --data-file=- 2>nul || gcloud secrets versions add prompd-editor-clerk-secret --data-file=-
echo Done.

:: OpenAI API Key
echo.
echo === OpenAI API Key ===
echo Enter your OpenAI API key (sk-...)
set /p OPENAI_KEY="OPENAI_API_KEY: "
echo %OPENAI_KEY%| gcloud secrets create prompd-editor-openai-key --data-file=- 2>nul || gcloud secrets versions add prompd-editor-openai-key --data-file=-
echo Done.

:: Anthropic API Key
echo.
echo === Anthropic API Key ===
echo Enter your Anthropic API key (sk-ant-...)
set /p ANTHROPIC_KEY="ANTHROPIC_API_KEY: "
echo %ANTHROPIC_KEY%| gcloud secrets create prompd-editor-anthropic-key --data-file=- 2>nul || gcloud secrets versions add prompd-editor-anthropic-key --data-file=-
echo Done.

echo.
echo === All secrets created! ===
echo.
echo Verifying secrets exist:
call "%~dp0check-deployment.bat"
