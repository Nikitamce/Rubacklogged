# Translation dictionary generator for Changelog batches
# Rules for translations:
# - Accurate gamer/UI terminology (reviews = отзывы, journal = журнал, lists = списки, logs = записи, backlog = бэклог)
# - Verbs in past tense for changelog entries ("Исправлено...", "Добавлено...", "Обновлено...")
import json

def translate_phrase(text):
    # Common prefixes / patterns in changelog
    t = text.strip()
    return t

# Let's inspect chunk 0
with open('tests/cl_chunk_0.json', 'r', encoding='utf-8') as f:
    c0 = json.load(f)

print(f"Chunk 0 count: {len(c0)}")
for i, item in enumerate(c0[:15]):
    print(f"{i}: {repr(item)}")
