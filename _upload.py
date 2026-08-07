import os, base64, json, urllib.request, urllib.error, sys

TOKEN = os.environ.get('GH_TOKEN')
OWNER = '643473049-star'
REPO = 'shuati-pwa'
BASE = r'E:\360MoveData\Users\刘嘉伟\Desktop\workbuddy工作夹\程序设计\刷题软件PWA'

def put(rel, b64):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{rel}'
    data = json.dumps({'message': f'add {rel}', 'content': b64}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json',
        'User-Agent': 'shuati-pwa-upload'
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, ''
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'ignore')[:300]

# 收集文件
files = []
for root, dirs, fs in os.walk(BASE):
    for f in fs:
        full = os.path.join(root, f)
        rel = os.path.relpath(full, BASE).replace('\\', '/')
        files.append(rel)

# 先放 .nojekyll，再放其他（保证根有文件）
files.sort(key=lambda x: (x != '.nojekyll', x))

ok, fail = 0, 0
for rel in files:
    with open(os.path.join(BASE, rel.replace('/', os.sep)), 'rb') as fh:
        b64 = base64.b64encode(fh.read()).decode('ascii')
    st, err = put(rel, b64)
    if st in (200, 201):
        ok += 1
        print(f'[OK {st}] {rel}')
    else:
        fail += 1
        print(f'[FAIL {st}] {rel} -> {err}')

print(f'\n=== 完成: 成功 {ok}, 失败 {fail} ===')
