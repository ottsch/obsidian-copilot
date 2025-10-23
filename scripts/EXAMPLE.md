# Example Usage

## Quick Start

This example shows how to generate embeddings for markdown notes using the CLI.

### 1. Set up test vault

```bash
# Create a test directory with some markdown notes
mkdir -p /tmp/my-notes

# Create an example note
cat > /tmp/my-notes/example.md << 'EOF'
---
tags: [ai, embeddings]
---

# My First Note

This is an example note about embeddings.

## What are embeddings?

Embeddings are vector representations of text that capture semantic meaning.
They're useful for:
- Semantic search
- Similarity detection
- Retrieval-augmented generation (RAG)

## How to use

Simply run the CLI tool to generate embeddings for all your markdown files!
EOF
```

### 2. Generate embeddings

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="sk-your-key-here"

# Run the embedding CLI
bun scripts/embed-notes.ts \
  --vault-path /tmp/my-notes \
  --output /tmp/embeddings.jsonl
```

### 3. View the results

```bash
# The output file contains one JSON object per line
head -n 1 /tmp/embeddings.jsonl | jq .

# Example output:
# {
#   "id": "abc123...",
#   "path": "/tmp/my-notes/example.md",
#   "title": "example",
#   "content": "NOTE TITLE: [[example]]\nMETADATA:\ntags: [ai, embeddings]\n\nNOTE BLOCK CONTENT:\n# My First Note\n...",
#   "embedding": [0.123, -0.456, 0.789, ...],  # 1536 dimensions for text-embedding-3-small
#   "chunkIndex": 0,
#   "embeddingModel": "text-embedding-3-small",
#   "created_at": 1705334400000,
#   "ctime": 1705334400000,
#   "mtime": 1705334400000,
#   "nchars": 245,
#   "tags": ["#ai", "#embeddings"]
# }
```

## Real-World Example

### Process an Obsidian Vault

```bash
# Export your OpenAI API key
export OPENAI_API_KEY="sk-..."

# Generate embeddings for your entire vault
# Excluding the .obsidian config folder
bun scripts/embed-notes.ts \
  --vault-path ~/Documents/ObsidianVault \
  --output ~/embeddings/vault-embeddings.jsonl \
  --exclude ".obsidian/**,archive/**"

# Expected output:
# Note Embeddings CLI - OpenAI Edition
#
# Configuration:
#   Vault Path: /home/user/Documents/ObsidianVault
#   Output Path: /home/user/embeddings/vault-embeddings.jsonl
#   Model: text-embedding-3-small
#   Batch Size: 100
#   Exclude: .obsidian/**, archive/**
#
# Scanning vault for markdown files...
# Found 247 markdown files
#
# Chunking files...
#   daily-note-2025-01-15.md: 1 chunks
#   project-ideas.md: 3 chunks
#   meeting-notes.md: 2 chunks
#   ...
#
# Total chunks created: 892
#
# Generating embeddings for 892 chunks in 9 batches...
# Processing batch 1/9 (100 chunks)...
#   ✓ Completed batch 1/9
# Processing batch 2/9 (100 chunks)...
#   ✓ Completed batch 2/9
# ...
#
# ✓ Embeddings written to /home/user/embeddings/vault-embeddings.jsonl
#
# Summary:
#   Files processed: 247
#   Total chunks: 892
#   Embedding dimension: 1536
#   Average chunks per file: 3.61
#
# ✓ Done!
```

### Use Different Embedding Model

```bash
# Use the larger, more accurate model
bun scripts/embed-notes.ts \
  --vault-path ~/Documents/Notes \
  --output embeddings-large.jsonl \
  --model text-embedding-3-large \
  --batch-size 50  # Smaller batches for larger model
```

### Process Only Specific Folders

```bash
# Only embed notes from specific folders
bun scripts/embed-notes.ts \
  --vault-path ~/Vault \
  --output project-embeddings.jsonl \
  --include "projects/**,work/**"
```

## What Gets Generated?

Each chunk from your markdown files becomes a JSON line in the output file:

```json
{
  "id": "d5f2a8c3b1e9f7a6c4e8d2b5a1f3c9e7",
  "path": "/home/user/notes/machine-learning.md",
  "title": "machine-learning",
  "content": "NOTE TITLE: [[machine-learning]]\nMETADATA:\ntags: [ai, ml]\ncreated: 2025-01-15\n\nNOTE BLOCK CONTENT:\n# Machine Learning Basics\n\nMachine learning is...",
  "embedding": [
    0.0123, -0.0456, 0.0789, ..., 0.0234
  ],
  "chunkIndex": 0,
  "embeddingModel": "text-embedding-3-small",
  "created_at": 1705334567890,
  "ctime": 1705334400000,
  "mtime": 1705334500000,
  "nchars": 487,
  "tags": ["#ai", "#ml"]
}
```

## Using the Embeddings

The generated embeddings can be:

1. **Loaded into a vector database** (Pinecone, Weaviate, Milvus, etc.)
2. **Used for semantic search** - Find similar notes based on meaning, not just keywords
3. **Integrated with RAG systems** - Retrieve relevant context for LLM prompts
4. **Analyzed for clustering** - Group similar notes together
5. **Used for recommendations** - Suggest related notes

### Example: Load into Python

```python
import json

# Load embeddings
embeddings = []
with open('embeddings.jsonl', 'r') as f:
    for line in f:
        embeddings.append(json.loads(line))

print(f"Loaded {len(embeddings)} chunks")
print(f"Embedding dimension: {len(embeddings[0]['embedding'])}")

# Example: Find similar chunks using cosine similarity
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

vectors = np.array([e['embedding'] for e in embeddings])
query_vector = embeddings[0]['embedding']  # Use first chunk as query

similarities = cosine_similarity([query_vector], vectors)[0]
top_5_indices = similarities.argsort()[-5:][::-1]

print("\nTop 5 most similar chunks:")
for idx in top_5_indices:
    print(f"  {embeddings[idx]['title']} (chunk {embeddings[idx]['chunkIndex']})")
```

## Performance Notes

### Cost Estimation

OpenAI embedding pricing (as of 2025):
- **text-embedding-3-small**: ~$0.02 per 1M tokens
- **text-embedding-3-large**: ~$0.13 per 1M tokens

For a vault with 1000 notes averaging 500 words each:
- Approximate tokens: 1000 notes × 500 words × 1.3 tokens/word = ~650K tokens
- Cost with text-embedding-3-small: ~$0.013
- Cost with text-embedding-3-large: ~$0.085

### Processing Time

Typical performance with `text-embedding-3-small`:
- 100 chunks: ~5-10 seconds
- 1,000 chunks: ~1-2 minutes
- 10,000 chunks: ~10-20 minutes

(Times vary based on network speed and API rate limits)
