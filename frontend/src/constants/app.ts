/**
 * Central app constants - single source of truth for app metadata
 */

export const APP_NAME = 'Prompd'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0'
export const APP_DESCRIPTION = 'The composable AI prompt ecosystem - create, share, and deploy AI workflows.'

export const APP_LICENSE = {
  type: 'Elastic License 2.0 (ELv2)',
  copyright: 'Copyright (c) 2026 Prompd LLC'
}

export const APP_LINKS = {
  privacy: 'https://prompdhub.ai/privacy',
  terms: 'https://prompdhub.ai/terms',
  website: 'https://prompd.io'
}
