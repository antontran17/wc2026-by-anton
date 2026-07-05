import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Replace padding in capsule
countdown_regex = r'padding: 6px 20px;'
html = re.sub(countdown_regex, 'padding: 12px 24px;', html)

# 2. Fix the bounceLeft and bounceRight keyframes to include translate Y -15px
bounce_left_regex = r'@keyframes bounceLeft \{\s*0%, 100% \{ transform: translateX\(0\); \}\s*50% \{ transform: translateX\(-10px\); \}\s*\}'
bounce_left_new = '''@keyframes bounceLeft {
            0%, 100% { transform: translate(0, -15px); }
            50% { transform: translate(-10px, -15px); }
        }'''
html = re.sub(bounce_left_regex, bounce_left_new, html)

bounce_right_regex = r'@keyframes bounceRight \{\s*0%, 100% \{ transform: translateX\(0\); \}\s*50% \{ transform: translateX\(10px\); \}\s*\}'
bounce_right_new = '''@keyframes bounceRight {
            0%, 100% { transform: translate(0, -15px); }
            50% { transform: translate(10px, -15px); }
        }'''
html = re.sub(bounce_right_regex, bounce_right_new, html)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Alignment and padding tweaked!")
