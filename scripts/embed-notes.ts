#!/usr/bin/env bun

/**
 * Standalone CLI tool to generate embeddings for markdown notes using OpenAI
 *
 * Usage:
 *   bun scripts/embed-notes.ts --vault-path /path/to/notes --output embeddings.jsonl
 *   # or
 *   ./scripts/embed-notes.sh --vault-path /path/to/notes --output embeddings.jsonl
 *
 * Environment Variables:
 *   OPENAI_API_KEY - OpenAI API key (required)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// Constants matching the main codebase
const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 200;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MODEL = 'text-embedding-3-small';

interface ChunkWithMetadata {
  id: string;
  path: string;
  title: string;
  content: string;
  chunkIndex: number;
  ctime: number;
  mtime: number;
  nchars: number;
  tags: string[];
}

interface EmbeddingOutput {
  id: string;
  path: string;
  title: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  embeddingModel: string;
  created_at: number;
  ctime: number;
  mtime: number;
  nchars: number;
  tags: string[];
}

interface CLIOptions {
  vaultPath: string;
  outputPath: string;
  apiKey: string;
  model: string;
  batchSize: number;
  include?: string[];
  exclude?: string[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: Partial<CLIOptions> = {
    model: DEFAULT_MODEL,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vault-path':
      case '-v':
        options.vaultPath = args[++i];
        break;
      case '--output':
      case '-o':
        options.outputPath = args[++i];
        break;
      case '--api-key':
      case '-k':
        options.apiKey = args[++i];
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--batch-size':
      case '-b':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--include':
        options.include = args[++i].split(',');
        break;
      case '--exclude':
        options.exclude = args[++i].split(',');
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  // Validate required options
  if (!options.vaultPath) {
    console.error('Error: --vault-path is required');
    printUsage();
    process.exit(1);
  }

  if (!options.outputPath) {
    console.error('Error: --output is required');
    printUsage();
    process.exit(1);
  }

  // Get API key from env or args
  options.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!options.apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable or --api-key option required');
    process.exit(1);
  }

  return options as CLIOptions;
}

/**
 * Print CLI usage information
 */
function printUsage(): void {
  console.log(`
Usage: bun scripts/embed-notes.ts [options]

Options:
  -v, --vault-path <path>     Path to vault/notes directory (required)
  -o, --output <path>         Output file path for embeddings (required)
  -k, --api-key <key>         OpenAI API key (or set OPENAI_API_KEY env var)
  -m, --model <model>         OpenAI embedding model (default: text-embedding-3-small)
  -b, --batch-size <size>     Batch size for embedding generation (default: 100)
  --include <patterns>        Comma-separated patterns to include (e.g., "*.md,notes/**")
  --exclude <patterns>        Comma-separated patterns to exclude (e.g., "archive/**,*.tmp")
  -h, --help                  Show this help message

Environment Variables:
  OPENAI_API_KEY              OpenAI API key

Examples:
  bun scripts/embed-notes.ts -v ./my-vault -o embeddings.jsonl
  bun scripts/embed-notes.ts -v ./notes -o out.jsonl --model text-embedding-3-large
  bun scripts/embed-notes.ts -v ./vault -o embeddings.jsonl --exclude "archive/**,drafts/**"
  ./scripts/embed-notes.sh -v ./vault -o embeddings.jsonl
`);
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(
  dir: string,
  exclude: string[] = [],
  include: string[] = []
): string[] {
  const files: string[] = [];

  // Log active patterns for transparency
  if (include.length > 0) {
    console.log(`  Include patterns: ${include.join(', ')}`);
  }
  if (exclude.length > 0) {
    console.log(`  Exclude patterns: ${exclude.join(', ')}`);
  }

  // Normalize patterns to use forward slashes for consistent matching
  const normalizedExclude = exclude.map(p => p.replace(/\\/g, '/'));
  const normalizedInclude = include.map(p => p.replace(/\\/g, '/'));

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      // Normalize path to use forward slashes for consistent matching
      const normalizedPath = relativePath.replace(/\\/g, '/');

      // Check exclusion patterns
      if (normalizedExclude.some(pattern => matchPattern(normalizedPath, pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Apply include filter if patterns are specified
        if (normalizedInclude.length > 0) {
          // File must match at least one include pattern
          if (!normalizedInclude.some(pattern => matchPattern(normalizedPath, pattern))) {
            continue;
          }
        }

        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * Simple pattern matching for file paths
 */
function matchPattern(filePath: string, pattern: string): boolean {
  // Convert glob-like patterns to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Extract frontmatter tags from markdown content
 */
function extractTags(content: string): string[] {
  const tags: string[] = [];

  // Extract from frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')));
    }
  }

  // Extract inline tags (#tag)
  const inlineTags = content.match(/#[\w-]+/g) || [];
  tags.push(...inlineTags);

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Create chunks from markdown file with metadata
 */
async function chunkMarkdownFile(
  filePath: string,
  content: string,
  splitter: RecursiveCharacterTextSplitter
): Promise<ChunkWithMetadata[]> {
  const stats = fs.statSync(filePath);
  const title = path.basename(filePath, '.md');
  const tags = extractTags(content);

  // Extract frontmatter for metadata
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';

  // Create document header with metadata (matching main codebase format)
  const header = `NOTE TITLE: [[${title}]]\n`;
  const metadataSection = frontmatter
    ? `METADATA:\n${frontmatter}\n\n`
    : '';

  // Split content into chunks
  const chunks = await splitter.splitText(content);

  return chunks.map((chunk: string, index: number) => {
    // Prefix each chunk with note context
    const prefixedContent = `${header}${metadataSection}NOTE BLOCK CONTENT:\n${chunk}`;

    return {
      id: crypto.createHash('md5').update(prefixedContent).digest('hex'),
      path: filePath,
      title,
      content: prefixedContent,
      chunkIndex: index,
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      nchars: prefixedContent.length,
      tags,
    };
  });
}

/**
 * Generate embeddings for chunks in batches
 */
async function generateEmbeddings(
  chunks: ChunkWithMetadata[],
  embeddings: OpenAIEmbeddings,
  batchSize: number,
  model: string
): Promise<EmbeddingOutput[]> {
  const results: EmbeddingOutput[] = [];
  const totalBatches = Math.ceil(chunks.length / batchSize);

  console.log(`\nGenerating embeddings for ${chunks.length} chunks in ${totalBatches} batches...`);

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);

    try {
      const texts = batch.map(c => c.content);
      const embeddingVectors = await embeddings.embedDocuments(texts);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: embeddingVectors[j],
          embeddingModel: model,
          created_at: Date.now(),
        });
      }

      console.log(`  ✓ Completed batch ${batchNum}/${totalBatches}`);
    } catch (error) {
      console.error(`  ✗ Error processing batch ${batchNum}:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Write embeddings to JSONL file
 */
function writeEmbeddingsToJSONL(embeddings: EmbeddingOutput[], outputPath: string): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const stream = fs.createWriteStream(outputPath);

  for (const embedding of embeddings) {
    stream.write(JSON.stringify(embedding) + '\n');
  }

  stream.end();
  console.log(`\n✓ Embeddings written to ${outputPath}`);
}

/**
 * Main execution function
 */
export async function run(args: string[]) {
  // Override process.argv for parseArgs
  process.argv = ['node', 'embed-notes.ts', ...args];

  return main();
}

/**
 * Main execution function
 */
async function main() {
  console.log('Note Embeddings CLI - OpenAI Edition\n');

  const options = parseArgs();

  console.log('Configuration:');
  console.log(`  Vault Path: ${options.vaultPath}`);
  console.log(`  Output Path: ${options.outputPath}`);
  console.log(`  Model: ${options.model}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  if (options.include && options.include.length > 0) {
    console.log(`  Include: ${options.include.join(', ')}`);
  }
  if (options.exclude && options.exclude.length > 0) {
    console.log(`  Exclude: ${options.exclude.join(', ')}`);
  }

  // Initialize OpenAI embeddings
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: options.apiKey,
    modelName: options.model,
    batchSize: options.batchSize,
    timeout: 10000,
  });

  // Initialize text splitter (matching main codebase)
  const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });

  // Find all markdown files
  console.log('\nScanning vault for markdown files...');
  const files = findMarkdownFiles(options.vaultPath, options.exclude || [], options.include || []);
  console.log(`Found ${files.length} markdown files`);

  if (files.length === 0) {
    console.log('No files to process. Exiting.');
    return;
  }

  // Process files and create chunks
  console.log('\nChunking files...');
  const allChunks: ChunkWithMetadata[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const chunks = await chunkMarkdownFile(file, content, splitter);
      allChunks.push(...chunks);
      console.log(`  ${path.basename(file)}: ${chunks.length} chunks`);
    } catch (error) {
      console.error(`  ✗ Error processing ${file}:`, error);
    }
  }

  console.log(`\nTotal chunks created: ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.log('No chunks to process. Exiting.');
    return;
  }

  // Generate embeddings
  const embeddingsWithVectors = await generateEmbeddings(
    allChunks,
    embeddings,
    options.batchSize,
    options.model
  );

  // Write to output file
  writeEmbeddingsToJSONL(embeddingsWithVectors, options.outputPath);

  // Print summary
  console.log('\nSummary:');
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Total chunks: ${embeddingsWithVectors.length}`);
  console.log(`  Embedding dimension: ${embeddingsWithVectors[0]?.embedding.length || 'N/A'}`);
  console.log(`  Average chunks per file: ${(embeddingsWithVectors.length / files.length).toFixed(2)}`);
  console.log('\n✓ Done!');
}

// Direct execution when run as main module (Bun support)
if (import.meta.main) {
  main().catch(error => {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  });
}
