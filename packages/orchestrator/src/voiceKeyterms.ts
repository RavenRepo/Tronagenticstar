import * as fs from 'fs';
import * as path from 'path';

export interface Keyterm {
  phrase: string;
  matches: string[];
}

const DEFAULT_KEYTERMS: Keyterm[] = [
  {
    phrase: 'TypeScript',
    matches: ['Typescript', 'Typescript', 'TS']
  },
  {
    phrase: 'JavaScript',
    matches: ['Javascript', 'JS']
  },
  {
    phrase: 'React',
    matches: ['ReactJS', 'React.js']
  },
  {
    phrase: 'Next.js',
    matches: ['NextJS', 'Next', 'NextJS']
  },
  {
    phrase: 'Node.js',
    matches: ['NodeJS', 'Node']
  },
  {
    phrase: 'API',
    matches: ['Api', 'A-P-I']
  },
  {
    phrase: 'WebSocket',
    matches: ['Websocket', 'WS']
  },
  {
    phrase: 'WebRTC',
    matches: ['WebRtc']
  },
  {
    phrase: 'GraphQL',
    matches: ['Graph QL', 'GQL']
  },
  {
    phrase: 'REST',
    matches: ['Rest', 'RESTful']
  },
  {
    phrase: 'PostgreSQL',
    matches: ['Postgres', 'PSQL']
  },
  {
    phrase: 'MongoDB',
    matches: ['Mongodb', 'Mongo']
  },
  {
    phrase: 'Redis',
    matches: ['RedIS']
  },
  {
    phrase: 'Docker',
    matches: ['docker']
  },
  {
    phrase: 'Kubernetes',
    matches: ['K8s', 'Kube']
  },
  {
    phrase: 'CI/CD',
    matches: ['CI CD', 'CICD', 'continuous integration']
  },
  {
    phrase: 'JWT',
    matches: ['JWT token', 'JSON Web Token']
  },
  {
    phrase: 'OAuth',
    matches: ['OAuth2', 'OAUTH']
  },
  {
    phrase: 'npm',
    matches: ['NPM', 'npmjs']
  },
  {
    phrase: 'Yarn',
    matches: ['yarn']
  },
  {
    phrase: 'Webpack',
    matches: ['webpack']
  },
  {
    phrase: 'Vite',
    matches: ['vite']
  },
  {
    phrase: 'ESLint',
    matches: ['ES Lint', 'eslint']
  },
  {
    phrase: 'Prettier',
    matches: ['prettier']
  },
  {
    phrase: 'Tronagenticstar',
    matches: ['Tronagentic Star', 'Tron agent']
  },
  {
    phrase: 'opencode',
    matches: ['open code', 'opencode']
  },
  {
    phrase: 'MCP',
    matches: ['Model Context Protocol', 'MCP server']
  },
  {
    phrase: 'sandbox',
    matches: ['Sandbox', 'sand box']
  },
  {
    phrase: 'orchestrator',
    matches: ['Orchestrator', 'orchistration']
  },
  {
    phrase: 'agent',
    matches: ['Agent', 'ai agent']
  }
];

let loadedKeyterms: Keyterm[] = [...DEFAULT_KEYTERMS];

export function loadKeyterms(filePath: string): Keyterm[] {
  try {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(process.cwd(), filePath);
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const parsed = JSON.parse(content);
    
    if (Array.isArray(parsed)) {
      loadedKeyterms = [...DEFAULT_KEYTERMS, ...parsed];
    }
    
    return loadedKeyterms;
  } catch (error) {
    console.warn(`Failed to load keyterms from ${filePath}: ${error}`);
    return DEFAULT_KEYTERMS;
  }
}

export function getKeytermHints(): Keyterm[] {
  return loadedKeyterms;
}

export function addKeyterm(keyterm: Keyterm): void {
  if (!loadedKeyterms.find(k => k.phrase === keyterm.phrase)) {
    loadedKeyterms.push(keyterm);
  }
}

export function clearKeyterms(): void {
  loadedKeyterms = [...DEFAULT_KEYTERMS];
}

export function getKeytermPhrases(): string[] {
  return loadedKeyterms.map(k => k.phrase);
}

export function findMatchingKeyterm(input: string): Keyterm | undefined {
  const normalizedInput = input.toLowerCase();
  
  return loadedKeyterms.find(keyterm => 
    keyterm.phrase.toLowerCase() === normalizedInput ||
    keyterm.matches.some(match => match.toLowerCase() === normalizedInput)
  );
}

export function createKeytermHintsForProvider(provider: string): Record<string, unknown> {
  const hints: Record<string, unknown> = {};
  
  for (const keyterm of loadedKeyterms) {
    hints[keyterm.phrase] = {
      phrases: [keyterm.phrase, ...keyterm.matches]
    };
  }
  
  return hints;
}