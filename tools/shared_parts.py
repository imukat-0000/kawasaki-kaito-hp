#!/usr/bin/env python3
"""日本語の全ページのヘッダー・メニュー・フッター（お問い合わせ）・「次に見る」をそろえる。何度実行しても同じ結果になる。
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
# 表の部品（展示の予定表・記事の行）を入れるページと、下層ページの型を入れるページ
PARTS_PAGES={'index.html'}
SUB_PAGES={'exhibitions/index.html','works/shuiro-wakin/index.html','journal/index.html','journal/kogei-realism/index.html','journal/vermilion-wakin-cluster/index.html','profile/index.html','sales/index.html','privacy/index.html'}
KEEP_MARGIN={'works/index.html'}
HERE=os.path.dirname(os.path.abspath(__file__))
def block(name, note, *files):
    body=''.join(open(os.path.join(HERE,f),encoding='utf8').read() for f in files)
    return f'/* {name}（{note}。tools/shared_parts.py が書く。手で直さない） */\n{body}/* /{name} */\n'
PARTS=block('shared:parts','表の部品：展示の予定表・記事の行','shared_parts.parts.css')
PAGE=block('shared:page','下層ページの型','shared_parts.parts.css','shared_parts.page.css')
NAV=[('works','works/','作品'),('concept','concept/','コンセプト'),('exhibitions','exhibitions/','展示'),('journal','journal/','ジャーナル'),('profile','profile/','河﨑海斗')]
MINCHO='"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif'
DIDOT='"Didot","Bodoni 72","Bodoni MT","Noto Serif JP",serif'
GOTH='"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif'
CSS=f'''/* shared:foot（全ページ共通：ヘッダー・メニュー・矢印つきリンク・次に見る・お問い合わせ・フッター。tools/shared_parts.py が書く。手で直さない） */
:root{{
  --pm:clamp(1.4rem,7vw,7.5rem); --col-gap:clamp(1rem,2vw,2rem); --hd:4.5rem;
  --band:#16181C; --band-ink:#EFEADF; --band-soft:#A6A398; --band-line:#34373D; --band-hido:#DB7C5C;
}}
@media (prefers-color-scheme: dark){{ :root{{ --band:#0B0D10; --band-line:#262A30; }} }}
:root[data-theme="light"]{{ --band:#16181C; --band-line:#34373D; }}
:root[data-theme="dark"]{{ --band:#0B0D10; --band-line:#262A30; }}

/* ---- ヘッダー：帯と罫をやめ、名前と目次だけを細く置く ---- */
header{{
  align-items:center; height:var(--hd); padding:0 var(--pm);
  border-bottom:0; background:color-mix(in srgb, var(--paper) 90%, transparent);
}}
.brand{{
  flex-direction:row; align-items:center; gap:1.1rem;
  font-size:1.02rem; font-weight:500; letter-spacing:.34em; color:var(--ink); white-space:nowrap;
}}
.brand-tagline{{
  font-size:.62rem; letter-spacing:.24em; line-height:1; color:var(--ink-soft);
  padding:.35em 0 .35em 1.1rem; border-left:1px solid var(--line);
}}
#mainNav{{ height:var(--hd); right:var(--pm); }}
#mainNav ul{{ gap:clamp(1.3rem,2.3vw,2.4rem); }}
#mainNav li a{{
  position:relative; display:inline-block; padding:.55em 0; margin-right:-.16em;
  font-size:.8rem; font-weight:500; letter-spacing:.16em; color:var(--ink);
  background:linear-gradient(currentColor,currentColor) left bottom / 0 1px no-repeat;
  transition:background-size .35s ease, color .25s ease;
}}
#mainNav li a:hover{{ color:var(--ink); background-size:calc(100% - .16em) 1px; }}
#mainNav li a[aria-current]{{ color:var(--ink); }}
#mainNav li a[aria-current]::before{{
  content:""; position:absolute; left:calc(50% - .08em); top:-.2em; width:4px; height:4px; margin-left:-2px;
  border-radius:50%; background:var(--hido);
}}
#mainNav li a[hreflang]{{ font-family:{DIDOT}; font-size:.86rem; letter-spacing:.2em; }}
.menu-btn{{
  display:none; position:relative; z-index:26; align-items:center; gap:.75rem;
  height:2.75rem; padding:0 0 0 .8rem; margin-right:-.3em; background:none; border:0; cursor:pointer;
  font-family:{MINCHO}; font-size:.84rem; font-weight:500; letter-spacing:.3em; color:var(--ink);
}}
.menu-btn i{{
  display:block; width:1.5rem; height:7px; border-top:1px solid currentColor; border-bottom:1px solid currentColor;
  transition:height .25s ease;
}}
.menu-btn .nt-close{{ display:none; }}
body.nav-open .menu-btn i{{ height:1px; border-bottom:0; }}
body.nav-open .menu-btn .nt-open{{ display:none; }}
body.nav-open .menu-btn .nt-close{{ display:inline; }}
@media (max-width:1100px){{
  .menu-btn{{ display:inline-flex; }}
  /* 目次：本の目次のように、縦書きで右から並べる */
  #mainNav{{
    inset:0; right:auto; width:100%; height:100%;
    padding:calc(var(--hd) + 1.6rem) var(--pm) 5.5rem; justify-content:center; align-items:center;
    background:var(--paper);
  }}
  #mainNav ul{{ flex-direction:row-reverse; align-items:flex-start; justify-content:center; gap:clamp(.9rem,4.4vw,2.6rem); margin:auto; }}
  #mainNav li{{ writing-mode:vertical-rl; line-height:1; }}
  #mainNav li a{{
    padding:0 .25em; margin:0; background:none;
    font-size:clamp(1.25rem,5.4vw,2rem); letter-spacing:.36em;
  }}
  #mainNav li a:hover{{ color:var(--hido); background:none; }}
  #mainNav li a[aria-current]::before{{ left:50%; top:-1.1em; width:5px; height:5px; margin-left:-2.5px; }}
  #mainNav li a[hreflang]{{ font-size:clamp(1.1rem,4.4vw,1.6rem); letter-spacing:0; text-combine-upright:all; -webkit-text-combine:horizontal; }}
  .nav-sns{{ left:var(--pm); }}
  #mainNav .nav-sns a{{ font-family:{GOTH}; font-size:.72rem; font-weight:400; letter-spacing:.2em; color:var(--ink-soft); }}
}}
@media (max-width:1100px) and (max-height:520px){{
  #mainNav{{ padding:calc(var(--hd) + .4rem) var(--pm) 3.4rem; }}
  #mainNav ul{{ display:flex; gap:clamp(1.2rem,4vw,2.6rem); }}
  #mainNav li a{{ font-size:1.05rem; }}
}}

/* ---- 矢印つきリンク：下線をやめ、細い線の矢印を添える ---- */
.ar{{
  display:inline-block; position:relative; width:2.3em; height:1px; margin-left:.9em; vertical-align:.34em;
  background:currentColor; transition:width .35s ease;
}}
.ar::after{{
  content:""; position:absolute; right:0; top:-3px; width:6px; height:6px;
  border-top:1px solid currentColor; border-right:1px solid currentColor; transform:rotate(45deg);
}}
a:hover > .ar{{ width:3.4em; }}
.lk, .more-link a, .next-list a, .ex-link{{
  display:inline-block; padding:.5em 0; border:0; text-decoration:none;
  font-size:.82rem; letter-spacing:.16em; color:var(--ink); transition:color .25s ease;
}}
.lk:hover, .more-link a:hover, .next-list a:hover, .ex-link:hover{{ color:var(--hido); }}

/* ---- 次に見る：ページの終わりに、次の行き先を大きな明朝で一つ ---- */
.next-links{{
  position:relative; z-index:1; max-width:1560px;
  margin:clamp(5rem,11vw,9rem) auto 0; padding:0 var(--pm) clamp(5rem,10vw,8.5rem); border-top:0;
  display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); column-gap:var(--col-gap); row-gap:1.6rem; align-items:start;
}}
.next-head{{
  grid-column:1 / 3; justify-self:start; display:block; writing-mode:vertical-rl; white-space:nowrap;
  font-family:{MINCHO}; font-size:1.15rem; font-weight:500; letter-spacing:.5em; line-height:1.2; color:var(--ink);
}}
.next-head span{{
  display:inline-block; margin-top:1.8em;
  font-family:{GOTH}; font-weight:400; font-size:.62rem; letter-spacing:.42em; color:var(--hido);
}}
.next-body{{ grid-column:3 / -1; display:flex; flex-direction:column; align-items:flex-start; gap:clamp(1.4rem,3vw,2.2rem); }}
.next-main a{{
  display:inline-block; padding:0; border:0; text-decoration:none;
  font-family:{MINCHO}; font-size:clamp(1.7rem,4.4vw,3.3rem); font-weight:500; letter-spacing:.14em; line-height:1.5;
  color:var(--ink); transition:color .25s ease;
}}
.next-main a .ar{{ width:1.5em; margin-left:.5em; vertical-align:.3em; }}
.next-main a:hover .ar{{ width:2.1em; }}
.next-main a:hover{{ color:var(--hido); }}
.next-list{{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem clamp(1.8rem,4vw,3.2rem); }}

/* ---- フッター：墨色の帯。左にお問い合わせ、右に目次 ---- */
footer{{
  position:relative; z-index:1; background:var(--band); color:var(--band-ink);
  padding:clamp(4.5rem,9vw,7.5rem) var(--pm) 2.2rem; border-top:0; text-align:left;
  display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); column-gap:var(--col-gap); row-gap:clamp(3rem,7vw,5.5rem); align-items:start;
  font-size:.8rem; letter-spacing:.04em; scroll-margin-top:0;
}}
footer :focus-visible{{ outline-color:var(--band-hido); }}
.foot-contact{{ grid-column:1 / 9; display:flex; flex-direction:column; align-items:flex-start; gap:0; padding:0; }}
.foot-label{{
  display:flex; flex-direction:row; align-items:baseline; gap:1.2rem;
  font-family:{MINCHO}; font-size:.92rem; font-weight:500; letter-spacing:.36em; line-height:1.7; color:var(--band-ink);
}}
.foot-label span{{ font-family:{GOTH}; font-weight:400; font-size:.62rem; letter-spacing:.42em; color:var(--band-hido); }}
.foot-mail{{
  margin-top:clamp(1.6rem,3.4vw,2.6rem); padding:0; border:0; text-decoration:none; text-indent:0;
  font-family:{MINCHO}; font-size:clamp(1.55rem,3.8vw,2.9rem); font-weight:500; letter-spacing:.12em; line-height:1.5;
  color:var(--band-ink); transition:color .25s ease;
}}
.foot-mail .ar{{ width:1.5em; margin-left:.5em; vertical-align:.3em; }}
.foot-mail:hover{{ color:var(--band-hido); }}
.foot-mail:hover .ar{{ width:2.1em; }}
.foot-contact-lead{{ margin-top:clamp(1.4rem,3vw,2.2rem); font-size:.84rem; letter-spacing:.1em; line-height:2; color:var(--band-ink); }}
.foot-contact-note{{ margin-top:.5rem; max-width:34em; font-size:.76rem; letter-spacing:.08em; line-height:2; color:var(--band-soft); }}
.foot-contact-note a{{ color:var(--band-ink); text-decoration:none; border-bottom:1px solid var(--band-soft); }}
.foot-contact-note a:hover{{ color:var(--band-hido); border-color:var(--band-hido); }}
.footer-nav{{ grid-column:10 / -1; display:flex; flex-direction:column; flex-wrap:nowrap; align-items:flex-start; justify-content:flex-start; gap:.15rem; }}
.footer-nav a{{
  padding:.42em 0; text-decoration:none; white-space:nowrap;
  font-family:{MINCHO}; font-size:.88rem; letter-spacing:.2em; color:var(--band-ink); transition:color .25s ease;
}}
.footer-nav a.sub{{ font-family:{GOTH}; font-size:.7rem; letter-spacing:.14em; color:var(--band-soft); }}
.footer-nav a.sub:first-of-type{{ margin-top:1.1rem; }}
.footer-nav a:hover{{ color:var(--band-hido); }}
.foot-base{{
  grid-column:1 / -1; display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:.6rem 2rem;
  padding-top:1.5rem; border-top:1px solid var(--band-line);
}}
.footer-sns{{ display:flex; gap:1.8rem; }}
.footer-sns a{{ padding:.5em 0; border:0; border-radius:0; text-decoration:none; font-size:.7rem; letter-spacing:.2em; color:var(--band-soft); transition:color .25s ease; }}
.footer-sns a:hover{{ color:var(--band-hido); }}
.footer-copy{{ font-family:{DIDOT}; font-size:.7rem; letter-spacing:.3em; color:var(--band-soft); }}
@media (max-width:900px){{
  .next-links{{ grid-template-columns:1fr; }}
  .next-head{{ grid-column:1; writing-mode:horizontal-tb; font-size:1rem; letter-spacing:.3em; }}
  .next-head span{{ margin:0 0 0 1.2em; }}
  .next-body{{ grid-column:1; }}
  .foot-contact, .footer-nav{{ grid-column:1 / -1; }}
  .footer-nav{{ flex-direction:row; flex-wrap:wrap; gap:.1rem 1.8rem; }}
  .footer-nav a.sub:first-of-type{{ margin-top:0; }}
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
def header(brand_href):
    return f"""<header>
  <a class="brand" href="{brand_href}">河﨑海斗<span class="brand-tagline">金工作家・鋳金</span></a>
  <button class="menu-btn" id="navToggle" type="button" aria-label="メニューを開く" aria-expanded="false" aria-controls="mainNav"><i aria-hidden="true"></i><span class="nt-open">目次</span><span class="nt-close">閉じる</span></button>
</header>"""
AR='<span class="ar" aria-hidden="true"></span>'
def footer(pre, en):
    enl=f'\n    <a class="sub" href="{en}" hreflang="en">English</a>' if en else ''
    links=''.join(f'\n    <a href="{pre}{href}">{label}</a>' for _,href,label in NAV)
    return f"""<footer id="contact">
  <div class="foot-contact">
    <p class="foot-label">お問い合わせ<span lang="en">CONTACT</span></p>
    <a class="foot-mail" href="mailto:akaitomato1028@gmail.com">メールで問い合わせる{AR}</a>
    <p class="foot-contact-lead">展覧会・作品・取材のご相談は、メールでお知らせください。</p>
    <p class="foot-contact-note">取材・掲載用の高解像度画像もご用意できます。作品の取り扱い先は<a href="{pre}exhibitions/#dealers">展示のページ</a>にあります。</p>
  </div>
  <nav class="footer-nav" aria-label="フッターナビ">{links}
    <a class="sub" href="{pre}privacy/">プライバシーポリシー</a>{enl}
  </nav>
  <div class="foot-base">
    <div class="footer-sns">
      <a href="https://www.instagram.com/kkchaki" target="_blank" rel="noopener">Instagram</a>
      <a href="https://x.com/kkchaki" target="_blank" rel="noopener">X</a>
    </div>
    <p class="footer-copy">© <span id="cpyear">2026</span> KAITO KAWASAKI — KOGEI REALISM</p>
  </div>
</footer>"""
def nextblock(pre, items):
    lk=lambda href,label: f'<a href="{href if href.startswith("#") else pre+href}">{label}{AR}</a>'
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
    m=re.search(r'<header>\s*<a class="brand" href="([^"]+)">.*?</header>',s,re.S); assert m,f
    s=s[:m.start()]+header(m.group(1))+s[m.end():]
    m=re.search(r'(<nav aria-label="メイン" id="mainNav">\n)(  <ul>.*?  </ul>)',s,re.S); assert m,f
    en=re.search(r'<a href="([^"]+)" hreflang="en">EN</a>',m.group(2))
    en=en.group(1) if en else None  # 英語版のないページには EN を出さない
    s=s[:m.start(2)]+nav_ul(pre,cur,en)+s[m.end(2):]
    # フッター
    m=re.search(r'<footer[^>]*>.*?</footer>',s,re.S); assert m,f
    s=s[:m.start()]+footer(pre,en)+s[m.end():]
    # CSS（表の部品・下層ページの型は、共通の部品より前に置く）
    for name in ('shared:parts','shared:page','shared:foot'):
        s=re.sub(r'/\* '+name+r'（.*?/\* /'+name+r' \*/\n','',s,flags=re.S)
    extra=PARTS if f in PARTS_PAGES else PAGE if f in SUB_PAGES else ''
    css=CSS
    if f in KEEP_MARGIN:  # 中身を変えないページは、共通の部品の左右の余白を中身に合わせる
        css=css.replace('/* /shared:foot */',':root{ --pm:clamp(1.4rem,6vw,5rem); }\n/* /shared:foot */')
    i=s.index('</style>'); s=s[:i]+extra+css+s[i:]
    # 次に見る
    s=re.sub(r'  <!-- next -->.*?<!-- /next -->\n','',s,flags=re.S)
    if nxt:
        i=s.rindex('</main>'); s=s[:i]+nextblock(pre,nxt)+s[i:]
    if s!=o: open(p,'w',encoding='utf8').write(s); print('updated',f)
