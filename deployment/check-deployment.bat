@echo off
echo Checking Google Cloud Run deployment status for Prompd Editor Backend...
echo.

echo Current project:
gcloud config get-value project
echo.

echo Cloud Run services in us-central1:
gcloud run services list --region=us-central1 --platform=managed
echo.

echo Checking secrets for api-prompd-app:
echo.

echo prompd-editor-mongodb-uri:
gcloud secrets describe prompd-editor-mongodb-uri 2>nul && echo "  Exists" || echo "  Missing"

echo prompd-editor-jwt-secret:
gcloud secrets describe prompd-editor-jwt-secret 2>nul && echo "  Exists" || echo "  Missing"

echo prompd-editor-encryption-secret:
gcloud secrets describe prompd-editor-encryption-secret 2>nul && echo "  Exists" || echo "  Missing"

echo prompd-editor-clerk-secret:
gcloud secrets describe prompd-editor-clerk-secret 2>nul && echo "  Exists" || echo "  Missing"

echo prompd-editor-openai-key:
gcloud secrets describe prompd-editor-openai-key 2>nul && echo "  Exists" || echo "  Missing"

echo prompd-editor-anthropic-key:
gcloud secrets describe prompd-editor-anthropic-key 2>nul && echo "  Exists" || echo "  Missing"
echo.

echo Enabled APIs:
gcloud services list --enabled --filter="name:(cloudbuild.googleapis.com OR run.googleapis.com OR containerregistry.googleapis.com OR secretmanager.googleapis.com)" --format="value(name)"
echo.

echo To create missing secrets:
echo   echo -n "value" ^| gcloud secrets create SECRET_NAME --data-file=-
echo.

pause
