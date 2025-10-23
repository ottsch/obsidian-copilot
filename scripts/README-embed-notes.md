# Note Embeddings CLI

A minimal standalone CLI tool to generate embeddings for markdown notes using OpenAI's embedding models.

## Overview

This CLI tool extracts the note embedding logic from the Obsidian Copilot plugin and makes it available as a standalone command-line tool. It can process a directory of markdown files, chunk them intelligently, and generate embeddings using OpenAI's API.

## Features

- **Markdown-aware chunking**: Uses LangChain's RecursiveCharacterTextSplitter optimized for markdown
- **Intelligent chunking**: 6000 character chunks with 200 character overlap (matching main plugin behavior)
- **Metadata extraction**: Extracts tags and frontmatter from markdown files
- **Batch processing**: Configurable batch sizes for efficient API usage
- **Pattern matching**: Include/exclude files using glob-like patterns
- **JSONL output**: Outputs embeddings in newline-delimited JSON format

## Prerequisites

- [Bun](https://bun.sh) runtime (fast JavaScript/TypeScript runtime with native TS support)
- OpenAI API key
- Dependencies already installed in the main project

## Installation

1. Install Bun if you haven't already:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. No additional installation needed! The script uses dependencies from the main project.

## Usage

### Basic Usage

```bash
export OPENAI_API_KEY="your-api-key-here"

# Option 1: Direct with Bun
bun scripts/embed-notes.ts --vault-path ./my-notes --output embeddings.jsonl

# Option 2: Using npm script
npm run embed-notes -- --vault-path ./my-notes --output embeddings.jsonl

# Option 3: Using shell wrapper
./scripts/embed-notes.sh --vault-path ./my-notes --output embeddings.jsonl
```

### With Custom Model

```bash
bun scripts/embed-notes.ts \
  --vault-path ./my-vault \
  --output embeddings.jsonl \
  --model text-embedding-3-large
```

### With Exclusion Patterns

```bash
bun scripts/embed-notes.ts \
  --vault-path ./vault \
  --output embeddings.jsonl \
  --exclude "archive/**,drafts/**,.obsidian/**"
```

### All Options

```bash
bun scripts/embed-notes.ts \
  --vault-path /path/to/notes \
  --output embeddings.jsonl \
  --api-key sk-... \
  --model text-embedding-3-small \
  --batch-size 100 \
  --exclude "archive/**,*.tmp"
```

## Command-Line Options

| Option | Short | Description | Required | Default |
|--------|-------|-------------|----------|---------|
| `--vault-path` | `-v` | Path to vault/notes directory | Yes | - |
| `--output` | `-o` | Output file path for embeddings | Yes | - |
| `--api-key` | `-k` | OpenAI API key | No* | `OPENAI_API_KEY` env var |
| `--model` | `-m` | OpenAI embedding model | No | `text-embedding-3-small` |
| `--batch-size` | `-b` | Batch size for embedding generation | No | 100 |
| `--exclude` | - | Comma-separated patterns to exclude | No | - |
| `--include` | - | Comma-separated patterns to include | No | - |
| `--help` | `-h` | Show help message | No | - |

*Either `--api-key` or `OPENAI_API_KEY` environment variable is required

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (can be set instead of using `--api-key` option)

## Output Format

The tool outputs embeddings in JSONL (JSON Lines) format, where each line is a JSON object containing:

```json
{
  "id": "md5-hash-of-content",
  "path": "/absolute/path/to/file.md",
  "title": "file",
  "content": "NOTE TITLE: [[file]]\nMETADATA:\n...\nNOTE BLOCK CONTENT:\n...",
  "embedding": [0.123, -0.456, ...],
  "chunkIndex": 0,
  "embeddingModel": "text-embedding-3-small",
  "created_at": 1698765432000,
  "ctime": 1698700000000,
  "mtime": 1698765432000,
  "nchars": 1234,
  "tags": ["#example", "tag1"]
}
```

### Field Descriptions

- `id`: MD5 hash of the chunk content (unique identifier)
- `path`: Absolute file path to the source markdown file
- `title`: File name without extension
- `content`: Chunk content with metadata headers
- `embedding`: Vector embedding (array of floats)
- `chunkIndex`: Index of this chunk within the file (0-based)
- `embeddingModel`: OpenAI model used for embeddings
- `created_at`: Timestamp when embedding was generated
- `ctime`: File creation time (milliseconds)
- `mtime`: File modification time (milliseconds)
- `nchars`: Number of characters in the chunk
- `tags`: Array of tags extracted from frontmatter and inline tags

## Chunking Strategy

The tool uses the same chunking strategy as the main Obsidian Copilot plugin:

1. **Chunk Size**: 6000 characters
2. **Overlap**: 200 characters
3. **Separators**: Prioritizes natural markdown boundaries:
   - Double newlines (`\n\n`) - paragraph breaks
   - Single newlines (`\n`) - line breaks
   - Periods with space (`. `) - sentence endings
   - Spaces (` `) - word boundaries
   - Characters - last resort

4. **Metadata Prefix**: Each chunk includes:
   ```
   NOTE TITLE: [[filename]]
   METADATA:
   <frontmatter content>

   NOTE BLOCK CONTENT:
   <actual chunk content>
   ```

This format provides context for each chunk, improving embedding quality.

## Examples

### Example 1: Process a Personal Vault

```bash
export OPENAI_API_KEY="sk-..."
bun scripts/embed-notes.ts \
  --vault-path ~/Documents/MyVault \
  --output ~/embeddings/my-vault-embeddings.jsonl
```

### Example 2: Process Only Specific Folders

```bash
bun scripts/embed-notes.ts \
  --vault-path ~/Documents/Vault \
  --output embeddings.jsonl \
  --include "projects/**,notes/**"
```

### Example 3: Exclude Archive and Templates

```bash
bun scripts/embed-notes.ts \
  --vault-path ~/Vault \
  --output embeddings.jsonl \
  --exclude "archive/**,templates/**,.obsidian/**"
```

### Example 4: Use Large Embedding Model

```bash
bun scripts/embed-notes.ts \
  --vault-path ./vault \
  --output embeddings-large.jsonl \
  --model text-embedding-3-large \
  --batch-size 50
```

## Available OpenAI Embedding Models

- `text-embedding-3-small` (default) - 1536 dimensions, most cost-effective
- `text-embedding-3-large` - 3072 dimensions, highest quality
- `text-embedding-ada-002` - 1536 dimensions, legacy model

## Performance Considerations

- **Batch Size**: Default is 100. Reduce if you hit rate limits.
- **API Costs**: Each chunk consumes API tokens. Monitor usage in OpenAI dashboard.
- **Processing Time**: Depends on number of files, chunks, and API latency. Typical: 1000 chunks in 2-3 minutes.
- **Memory**: All chunks are loaded into memory before embedding generation. For very large vaults (10,000+ files), consider processing in batches.

## Error Handling

The CLI will:
- Skip files that can't be read (with error message)
- Exit on fatal errors (API authentication, network issues)
- Display progress for each batch
- Show detailed error messages with stack traces

## Integration with Main Plugin

This CLI tool uses the **exact same chunking logic** as the main Obsidian Copilot plugin:
- Same chunk size (6000 chars)
- Same overlap (200 chars)
- Same separators
- Same metadata prefix format

This ensures embeddings generated by the CLI are compatible with the plugin's vector store.

## License

Same as the main Obsidian Copilot project (see LICENSE file).

## Why Bun?

This CLI uses [Bun](https://bun.sh) instead of Node.js because:
- **Native TypeScript support** - No compilation needed, run `.ts` files directly
- **3x faster** - Significantly faster startup and execution times
- **Built-in performance** - Optimized for modern JavaScript/TypeScript workloads
- **Drop-in replacement** - Compatible with npm packages and Node.js APIs

## Troubleshooting

### "bun: command not found"

Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

Then restart your terminal or run:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### "OPENAI_API_KEY environment variable or --api-key option required"

Set your OpenAI API key:
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

Or pass it as an option:
```bash
bun scripts/embed-notes.ts -v ./vault -o out.jsonl -k "sk-your-key-here"
```

### "Error: Module not found"

Make sure you've installed dependencies:
```bash
npm install
```

### Rate Limit Errors

Reduce batch size:
```bash
bun scripts/embed-notes.ts -v ./vault -o out.jsonl --batch-size 50
```

### Out of Memory

Process vault in smaller batches by using exclusion patterns to process subsets.
