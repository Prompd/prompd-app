/**
 * MINIMAL TEST for Monaco Code Actions
 * This tests if code actions work AT ALL in this environment
 */
import type * as monacoEditor from 'monaco-editor'

export function registerTestCodeActionProvider(
  monaco: typeof monacoEditor
): monacoEditor.IDisposable {
  console.log('[TEST] Registering MINIMAL test code action provider')

  return monaco.languages.registerCodeActionProvider('prompd', {
    provideCodeActions() {
      console.log('[TEST] Provider called!')

      const actions: monacoEditor.languages.CodeAction[] = [
        {
          title: '✅ TEST ACTION - If you see this, code actions WORK!',
          kind: 'quickfix'
        }
      ]

      console.log('[TEST] Returning:', actions)

      return {
        actions,
        dispose() {}
      }
    }
  })
}
