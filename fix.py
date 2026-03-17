with open('tiktok_scraper.py', 'r') as f:
    content = f.read()
content = content.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
with open('tiktok_scraper.py', 'w') as f:
    f.write(content)
print('Fixed')
