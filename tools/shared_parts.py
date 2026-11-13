#!/usr/bin/env python3
"""日本語の全ページのメニュー・フッター（お問い合わせ）・「次に見る」をそろえる。何度実行しても同じ結果になる。
実行: python3 tools/shared_parts.py （ページを足したら下の PAGES に足す）"""
import re, sys, os
ROOT=sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
# file: (深さの接頭辞, 現在地, 次に見る)
PAGES={
 'index.html':('', None, None),
 'concept/index.html':('../','concept', None),
 'exhibitions/index.html':('../','exhibitions',[('works/','作品を見る'),('profile/','河﨑海斗について'),('journal/','ジャーナルを読む')]),
 'works/index.html':('../','works',[('concept/','コンセプトを読む'),('exhibitions/','展示で実物を見る'),('journal/','ジャーナルを読む')]),
 'works/shuiro-wakin/index.html':('../../','works',[('works/','ほかの作品を見る'),('journal/vermilion-wakin-cluster/','《朱色和金群》の記事を読む'),('exhibitions/','展示で実物を見る')]),
 'journal/index.html':('../','journal',[('works/','作品を見る'),('concept/','コンセプトを読む'),('exhibitions/','展示')]),
 'journal/kogei-realism/index.html':('../../','journal',[('works/','作品を見る'),('concept/','コンセプトを読む'),('journal/','ほかの記事を読む')]),
 'journal/vermilion-wakin-cluster/index.html':('../../','journal',[('works/','作品を見る'),('exhibitions/','展示で実物を見る'),('journal/','ほかの記事を読む')]),
 'profile/index.html':('../','profile',[('works/','作品を見る'),('exhibitions/','展示'),('#contact','取材・お問い合わせ')]),
 'sales/index.html':('../','exhibitions',[('exhibitions/','展示の予定を見る'),('works/','作品を見る')]),
 'privacy/index.html':('../',None,None),
}
NAV=[('works','works/','作品'),('concept','concept/','コンセプト'),('exhibitions','exhibitions/','展示'),('journal','journal/','ジャーナル'),('profile','profile/','河﨑海斗')]
MINCHO='"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif'
CSS=f'''/* shared:foot（全ページ共通：次に見る・お問い合わせ・フッター。tools/shared_parts.py が書く。手で直さない） */
.next-links{{
  position:relative; z-index:1;
  margin:clamp(2.4rem,6vw,4.5rem) clamp(1.4rem,6vw,5rem) 0; padding:clamp(2.2rem,4.5vw,3.2rem) 0 clamp(3.2rem,7vw,5rem);
  border-top:1px solid var(--line);
  display:grid; grid-template-columns:minmax(0,11rem) minmax(0,1fr); column-gap:clamp(1.4rem,3vw,2.6rem); row-gap:1.2rem; align-items:baseline;
}}
.next-head, .foot-label{{
  display:flex; flex-direction:column; align-items:flex-start; gap:.5rem;
  font-family:{MINCHO}; font-size:1rem; font-weight:600; letter-spacing:.2em; line-height:1.7; color:var(--ink);
}}
.next-head span, .foot-label span{{ font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif; font-weight:400; font-size:.68rem; letter-spacing:.3em; color:var(--hido); }}
.next-body{{ display:flex; flex-direction:column; align-items:flex-start; gap:1rem; }}
.next-main a{{
  display:inline-block; font-family:{MINCHO}; font-size:clamp(1.25rem,2.2vw,1.6rem); letter-spacing:.2em;
  color:var(--ink); text-decoration:none; border-bottom:1px solid var(--ink); padding:.4em 0 .3em;
  transition:color .25s ease, border-color .25s ease;
}}
.next-list{{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem 2.4rem; }}
.next-list a{{
  font-size:.86rem; letter-spacing:.12em; color:var(--ink); text-decoration:none;
  border-bottom:1px solid var(--line); padding:.6em 0 .25em; transition:color .25s ease, border-color .25s ease;
}}
.next-main a:hover, .next-list a:hover{{ color:var(--hido); border-color:var(--hido); }}
footer{{
  position:relative; z-index:1; background:var(--paper);
  padding:clamp(3.4rem,7vw,5.5rem) 1.5rem 2.6rem; text-align:center;
  border-top:1px solid var(--line);
  display:flex; flex-direction:column; align-items:center; gap:1.8rem;
  font-size:.8rem; letter-spacing:.04em; color:var(--ink); scroll-margin-top:0;
}}
.foot-contact{{ display:flex; flex-direction:column; align-items:center; gap:1.1rem; padding:0 0 clamp(1.6rem,4vw,2.8rem); }}
.foot-label{{ align-items:center; }}
.foot-contact-lead{{ font-size:.86rem; letter-spacing:.08em; line-height:1.9; margin-top:.4rem; }}
.foot-mail{{
  font-family:{MINCHO}; font-size:clamp(1.15rem,2vw,1.4rem); letter-spacing:.2em; text-indent:.2em;
  color:var(--hido); text-decoration:none; border-bottom:1px solid currentColor; padding:.7em 0 .3em;
  transition:color .25s ease;
}}
.foot-mail:hover{{ color:var(--hido-deep); }}
.foot-contact-note{{ font-size:.74rem; color:var(--ink-soft); letter-spacing:.06em; line-height:1.9; margin-top:.4rem; }}
.foot-contact-note a{{ color:var(--hido); text-decoration:none; border-bottom:1px solid color-mix(in srgb, var(--hido) 45%, transparent); }}
.footer-nav{{ display:flex; flex-wrap:wrap; justify-content:center; gap:.2rem 1.8rem; }}
.footer-nav a{{ font-size:.72rem; letter-spacing:.12em; color:var(--ink-soft); text-decoration:none; padding:.6em 0; transition:color .25s ease; }}
.footer-nav a:hover{{ color:var(--hido); }}
.footer-sns{{ display:flex; gap:1.6rem; }}
.footer-sns a{{ font-size:.68rem; letter-spacing:.16em; color:var(--ink-soft); text-decoration:none; border:0; border-radius:0; padding:.6em 0; transition:color .25s ease; }}
.footer-sns a:hover{{ color:var(--hido); }}
.footer-copy{{ font-size:.68rem; letter-spacing:.3em; color:var(--ink-soft); }}
@media (max-width:900px){{
  .next-links{{ grid-template-columns:1fr; }}
  .next-head{{ flex-direction:row; align-items:baseline; gap:1rem; }}
}}
/* /shared:foot */
'''
def nav_ul(pre, cur, en):
    out=['  <ul>']
    for key,href,label in NAV:
        h=pre+href
        a=' aria-current="page"' if key==cur else ''
        out.append(f'    <li><a href="{h}"{a}>{label}</a></li>')
    out.append('    <li><a href="#contact">お問い合わせ</a></li>')
    if en: out.append(f'    <li><a href="{en}" hreflang="en">EN</a></li>')
    out.append('  </ul>')
    return '\n'.join(out)
def footer(pre, en):
    enl=f'\n    <a href="{en}" hreflang="en">English</a>' if en else ''
    links=''.join(f'\n    <a href="{pre}{href}">{label}</a>' for _,href,label in NAV)
    return f'''<footer id="contact">
  <div class="foot-contact">
    <p class="foot-label">お問い合わせ<span lang="en">CONTACT</span></p>
    <p class="foot-contact-lead">展覧会・作品・取材のご相談は、メールでお知らせください。</p>
    <a class="foot-mail" href="mailto:akaitomato1028@gmail.com">メールで問い合わせる<span aria-hidden="true"> →</span></a>
    <p class="foot-contact-note">取材・掲載用の高解像度画像もご用意できます。作品の取り扱い先は<a href="{pre}exhibitions/#dealers">展示のページ</a>にあります。</p>
  </div>
  <nav class="footer-nav" aria-label="フッターナビ">{links}
    <a href="{pre}privacy/">プライバシーポリシー</a>{enl}
  </nav>
  <div class="footer-sns">
    <a href="https://www.instagram.com/kkchaki" target="_blank" rel="noopener">Instagram</a>
    <a href="https://x.com/kkchaki" target="_blank" rel="noopener">X</a>
  </div>
  <p class="footer-copy">© <span id="cpyear">2026</span> KAITO KAWASAKI — KOGEI REALISM</p>
</footer>'''
def nextblock(pre, items):
    lk=lambda href,label: f'<a href="{href if href.startswith("#") else pre+href}">{label}<span aria-hidden="true"> →</span></a>'
    first=lk(*items[0]); ls=''.join(lk(*it) for it in items[1:])
    return f'''  <!-- next -->
  <nav class="next-links" aria-label="次に見る">
    <p class="next-head">次に見る<span lang="en">NEXT</span></p>
    <div class="next-body">
      <p class="next-main">{first}</p>
      <p class="next-list">{ls}</p>
    </div>
  </nav>
  <!-- /next -->
'''
for f,(pre,cur,nxt) in PAGES.items():
    p=os.path.join(ROOT,f); s=open(p,encoding='utf8').read(); o=s
    m=re.search(r'(<nav aria-label="メイン" id="mainNav">\n)(  <ul>.*?  </ul>)',s,re.S); assert m,f
    en=re.search(r'<a href="([^"]+)" hreflang="en">EN</a>',m.group(2))
    en=en.group(1) if en else None  # 英語版のないページには EN を出さない
    s=s[:m.start(2)]+nav_ul(pre,cur,en)+s[m.end(2):]
    # フッター
    m=re.search(r'<footer[^>]*>.*?</footer>',s,re.S); assert m,f
    s=s[:m.start()]+footer(pre,en)+s[m.end():]
    # CSS
    if '/* shared:foot' in s:
        s=re.sub(r'/\* shared:foot.*?/\* /shared:foot \*/\n',lambda _:CSS,s,flags=re.S)
    else:
        i=s.index('</style>'); s=s[:i]+CSS+s[i:]
    # 次に見る
    s=re.sub(r'  <!-- next -->.*?<!-- /next -->\n','',s,flags=re.S)
    if nxt:
        i=s.rindex('</main>'); s=s[:i]+nextblock(pre,nxt)+s[i:]
    if s!=o: open(p,'w',encoding='utf8').write(s); print('updated',f)
