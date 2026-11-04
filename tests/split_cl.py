import json

with open('missing_changelog_entries.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

print(f"Total changelog items to translate: {len(items)}")

# Split into chunks of 150 for clean batching
chunk_size = 150
chunks = [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]
print(f"Generated {len(chunks)} chunks.")

for idx, ch in enumerate(chunks):
    with open(f'tests/cl_chunk_{idx}.json', 'w', encoding='utf-8') as out:
        json.dump(ch, out, ensure_ascii=False, indent=2)

print("Saved all chunks.")
