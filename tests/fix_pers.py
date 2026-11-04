with open('locales/ru.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

insert_idx = -1
for idx, l in enumerate(lines):
    if "'Manage Consent':" in l:
        insert_idx = idx + 1
        break

if insert_idx != -1:
    lines.insert(insert_idx, "    'Personalized page': 'Персональная страница',\n")
    with open('locales/ru.js', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Added 'Personalized page' right after Manage Consent")
else:
    print("Manage Consent not found")

