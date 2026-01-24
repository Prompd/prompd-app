/**
 * Language detection utility for Monaco Editor
 * Maps file extensions to Monaco language identifiers
 */

export interface LanguageInfo {
  id: string
  extensions: string[]
  aliases?: string[]
}

// Monaco Editor built-in languages (extensive list)
export const MONACO_LANGUAGES: LanguageInfo[] = [
  // Web Technologies
  { id: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'], aliases: ['js'] },
  { id: 'typescript', extensions: ['.ts', '.tsx'], aliases: ['ts'] },
  { id: 'html', extensions: ['.html', '.htm', '.xhtml'] },
  { id: 'css', extensions: ['.css'] },
  { id: 'scss', extensions: ['.scss'] },
  { id: 'sass', extensions: ['.sass'] },
  { id: 'less', extensions: ['.less'] },
  { id: 'json', extensions: ['.json', '.jsonc'] },
  { id: 'xml', extensions: ['.xml', '.xsd', '.xsl', '.xslt', '.wsdl'] },
  
  // Data & Configuration
  { id: 'yaml', extensions: ['.yml', '.yaml'] },
  { id: 'toml', extensions: ['.toml'] },
  { id: 'ini', extensions: ['.ini', '.cfg', '.conf'] },
  { id: 'properties', extensions: ['.properties'] },
  { id: 'plaintext', extensions: ['.csv', '.tsv', '.txt', '.log'] },
  
  // Programming Languages
  { id: 'python', extensions: ['.py', '.pyw', '.pyi', '.pyx'] },
  { id: 'java', extensions: ['.java'] },
  { id: 'csharp', extensions: ['.cs', '.csx'] },
  { id: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h++'] },
  { id: 'c', extensions: ['.c', '.h'] },
  { id: 'go', extensions: ['.go'] },
  { id: 'rust', extensions: ['.rs'] },
  { id: 'php', extensions: ['.php', '.phtml', '.php3', '.php4', '.php5', '.phps'] },
  { id: 'ruby', extensions: ['.rb', '.rbw', '.rake', '.gemspec'] },
  { id: 'swift', extensions: ['.swift'] },
  { id: 'kotlin', extensions: ['.kt', '.kts'] },
  { id: 'scala', extensions: ['.scala', '.sc'] },
  { id: 'r', extensions: ['.r', '.R'] },
  { id: 'matlab', extensions: ['.m'] },
  { id: 'perl', extensions: ['.pl', '.pm', '.pod'] },
  { id: 'lua', extensions: ['.lua'] },
  
  // Functional Languages
  { id: 'haskell', extensions: ['.hs', '.lhs'] },
  { id: 'fsharp', extensions: ['.fs', '.fsi', '.fsx'] },
  { id: 'clojure', extensions: ['.clj', '.cljs', '.cljc', '.edn'] },
  
  // Shell & Scripts
  { id: 'shell', extensions: ['.sh', '.bash', '.zsh', '.fish', '.ksh', '.csh'] },
  { id: 'powershell', extensions: ['.ps1', '.psm1', '.psd1'] },
  { id: 'bat', extensions: ['.bat', '.cmd'] },
  
  // Database
  { id: 'sql', extensions: ['.sql', '.ddl', '.dml'] },
  
  // Markup & Documentation
  { id: 'markdown', extensions: ['.md', '.markdown', '.mdown', '.mkd'] },
  { id: 'latex', extensions: ['.tex', '.ltx'] },
  { id: 'restructuredtext', extensions: ['.rst'] },
  
  // Docker & DevOps
  { id: 'dockerfile', extensions: ['.dockerfile'], aliases: ['Dockerfile'] },
  
  // Templates
  { id: 'handlebars', extensions: ['.hbs', '.handlebars'] },
  { id: 'razor', extensions: ['.cshtml', '.razor'] },
  
  // Other Formats
  { id: 'graphql', extensions: ['.graphql', '.gql'] },
  { id: 'protobuf', extensions: ['.proto'] },
  { id: 'scheme', extensions: ['.scm', '.ss'] },
  { id: 'vb', extensions: ['.vb'] },
  { id: 'pascal', extensions: ['.pas', '.pp', '.inc'] },
  { id: 'objective-c', extensions: ['.m', '.mm'] },
  { id: 'tcl', extensions: ['.tcl'] },
  { id: 'apex', extensions: ['.cls', '.trigger'] },
  { id: 'azcli', extensions: ['.azcli'] },
  { id: 'freemarker2', extensions: ['.ftl'] },
  { id: 'liquid', extensions: ['.liquid'] },
  { id: 'mips', extensions: ['.s', '.asm'] },
  { id: 'pug', extensions: ['.pug', '.jade'] },
  { id: 'solidity', extensions: ['.sol'] },
  { id: 'st', extensions: ['.st'] },
  { id: 'systemverilog', extensions: ['.sv', '.svh'] },
  { id: 'verilog', extensions: ['.v', '.vh'] },
  { id: 'wgsl', extensions: ['.wgsl'] }
]

// Prompd ecosystem specific files
export const PROMPD_LANGUAGES: LanguageInfo[] = [
  { id: 'prompd', extensions: ['.prmd', '.prompd'], aliases: ['prompd'] },
  { id: 'json', extensions: ['.pdflow'], aliases: ['workflow'] },
  { id: 'json', extensions: ['.pdproj'], aliases: ['project'] }
]

/**
 * Get Monaco language identifier from file extension
 */
export function getLanguageFromExtension(fileName: string): string | undefined {
  if (!fileName) return undefined
  
  // Extract extension (including dot)
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) {
    // Handle special filenames without extensions
    const lowerName = fileName.toLowerCase()
    if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) return 'dockerfile'
    if (lowerName === 'makefile' || lowerName.startsWith('makefile.')) return 'makefile'
    if (lowerName === 'gemfile') return 'ruby'
    if (lowerName === 'rakefile') return 'ruby'
    return undefined
  }
  
  const extension = fileName.slice(lastDot).toLowerCase()
  
  // Check Prompd-specific files first
  for (const lang of PROMPD_LANGUAGES) {
    if (lang.extensions.includes(extension)) {
      return lang.id
    }
  }
  
  // Check standard Monaco languages
  for (const lang of MONACO_LANGUAGES) {
    if (lang.extensions.includes(extension)) {
      return lang.id
    }
  }
  
  return undefined
}

/**
 * Get all supported extensions for a given language
 */
export function getExtensionsForLanguage(languageId: string): string[] {
  const allLanguages = [...PROMPD_LANGUAGES, ...MONACO_LANGUAGES]
  const language = allLanguages.find(lang => lang.id === languageId)
  return language ? language.extensions : []
}

/**
 * Get a list of all supported languages with their extensions
 */
export function getAllSupportedLanguages(): LanguageInfo[] {
  return [...PROMPD_LANGUAGES, ...MONACO_LANGUAGES]
}

/**
 * Check if a file type is supported
 */
export function isLanguageSupported(fileName: string): boolean {
  return getLanguageFromExtension(fileName) !== undefined
}

/**
 * Get language display name for UI
 */
export function getLanguageDisplayName(languageId: string): string {
  const displayNames: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'csharp': 'C#',
    'cpp': 'C++',
    'fsharp': 'F#',
    'objective-c': 'Objective-C',
    'restructuredtext': 'reStructuredText',
    'prompd': 'Prompd',
    'systemverilog': 'SystemVerilog'
  }
  
  return displayNames[languageId] || languageId.charAt(0).toUpperCase() + languageId.slice(1)
}