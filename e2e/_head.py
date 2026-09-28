import re, urllib.request
html = urllib.request.urlopen("https://eager-transit-track-go.base44.app/").read().decode()
head = html.split("</head>")[0]
for pat in [r"<title[^<]*</title>", r'<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>', r'apple-mobile-web-app-title[^>]*']:
    for m in re.findall(pat, head):
        print(m)
