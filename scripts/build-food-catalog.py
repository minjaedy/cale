"""Build a compact public food catalogue from MFDS export rows.

Inputs (not shipped): qa/food-rows.json, qa/raw-food-rows.json,
qa/drink-rows.json. Column mappings are from the official XLSX headers.
Portions below are explicit UI estimates; nutrient values are never invented.
"""
import json, re, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
def rows(name): return json.loads((ROOT/'qa'/name).read_text(encoding='utf-8'))
def number(value):
 try: return float(value)
 except (TypeError, ValueError): return None
def amount(value, fallback=100):
 m=re.match(r'\s*(\d+(?:\.\d+)?)\s*(g|ml)',str(value),re.I)
 return float(m[1]) if m and 0<float(m[1])<=2000 else fallback
def clean(s): return re.sub(r'\s+',' ',s.replace('_',' ')).strip()
foods={}
def add(id,name,kcal,unit,serving=100,**extra):
 if kcal is None or not 0<=kcal<=900 or not name or len(name)>65:return
 key=re.sub(r'[\s_()]','',name).lower()
 if key not in foods:foods[key]=dict(id=id,name=name,kcal=kcal,serving=serving,unit=unit,**extra)
def byid(id): return next(f for f in foods.values() if f['id']==id)
def alias(id,*aliases,portions=None):
 f=byid(id);f['aliases']=list(dict.fromkeys(f.get('aliases',[])+list(aliases)))
 if portions:f['portions']={**f.get('portions',{}),**portions}
d=rows('food-rows.json')
for r in sorted(d,key=lambda r: r.get('E','')):
 if r.get('E') not in ['1','3'] or r.get('Q','').lower()!='100g':continue
 name=clean(r['B']);parts=name.split(' ')
 add(r['A'],name,number(r.get('R')),'g',amount(r.get('EY')),aliases=[''.join(parts[1:]+parts[:1])] if len(parts)>1 else [])
# Prepared beverages with an actual 100 ml basis; keep recipe/brand visible.
for r in d:
 if r.get('A','').startswith('D420') and r.get('Q','').lower()=='100ml':
  add(r['A'],clean(r['B']),number(r.get('R')),'ml',amount(r.get('EY'),355),portions={'잔':355,'컵':200})
r=next(r for r in d if r.get('A')=='D220-748080000-0069')
add(r['A'],'할리스 아메리카노',number(r['R']),'ml',354,aliases=['아메리카노','커피 아메리카노'],portions={'잔':354,'컵':200})
for id,name,names,portions in [
 ('D220-748130000-0025','할리스 카푸치노',['카푸치노'],{'잔':354,'컵':200}),
 ('D202-115000000-0038','할리스 햄치즈 스크램블 토스트',['토스트','햄치즈토스트'],{'개':100}),
 ('D401-063000000-0001','돼지머리국밥',['돼지국밥'],None)]:
 r=next(r for r in d if r.get('A')==id);unit='ml' if r['Q'].lower()=='100ml' else 'g';add(id,name,number(r['R']),unit,amount(r.get('EY')),aliases=names,**({'portions':portions} if portions else {}))
add('basic-water','생수',0,'ml',500,aliases=['물'],portions={'잔':200,'컵':200,'병':500})
for r in rows('raw-food-rows.json'):
 if r.get('K','').lower()!='100g':continue
 add(r['A'],clean(r.get('C','')),number(r.get('L')),'g')
p=rows('drink-rows.json')
# Prefer recent domestic records for duplicate packaged-product names.
p.sort(key=lambda r:(r.get('FA')!='Y',r.get('FG',''),r.get('FF','')),reverse=True)
count=0
p=sorted({clean(r.get('C','')):r for r in reversed(p)}.values(),key=lambda r:(len(clean(r.get('C',''))),r.get('C','')))
for r in p:
 unit={'100g':'g','100ml':'ml'}.get(r.get('R','').lower());kcal=number(r.get('S'))
 if not unit or kcal is None or len(r.get('C',''))>40:continue
 # Imported concentrates and implausible label conversions need manual review.
 if r.get('FA')=='Y' or (unit=='ml' and kcal>150):continue
 serving=amount(r.get('EW'),amount(r.get('EV'),100))
 if serving>500:serving=amount(r.get('EV'),200 if unit=='ml' else 100)
 portions={'잔':200,'컵':200,'캔':355,'병':500,'팩':serving} if unit=='ml' else {'봉지':serving,'팩':serving}
 add(r['A'],clean(r['C']),kcal,unit,serving,portions=portions)
 count+=1
 if count>=3500:break
# Short everyday names map to one visible reference food, never an average of
# incompatible raw/cooked foods. The UI always exposes the matched food and amount.
aliases={
 'D106-291030000-0001':(['순두부찌개'],None),
 'D108-386000000-0001':(['불고기'],None),
 'D103-144180000-0001':(['냉면','물냉면'],None),
 'D101-042200000-0001':(['초밥'],{'개':30}),
 'D303-161490000-0001':(['파스타','스파게티'],None),
 'D102-096150000-0001':(['샌드위치'],{'개':200}),
 'D107-307170000-0001':(['감자','찐감자'],{'개':150}),
 'D101-007480000-0001':(['김밥'],{'줄':250}),
 'D103-168000000-0001':(['짜장면'],None),
 'D312-550000000-0002':(['돈까스'],None),
 'D108-382000000-0001':(['삼겹살'],None),
 'D102-120350000-0001':(['피자','콤비네이션피자'],{'조각':125}),
 'D114-640320000-0001':(['샐러드'],None),
 'R108-037000001-0000':(['바나나'],{'개':100}),
 'R108-050000001-0000':(['사과'],{'개':200}),
 'R108-019010001-0000':(['딸기'],{'개':20}),
 'R108-010020001-0000':(['귤'],{'개':80}),
 'R108-069000001-0000':(['오렌지'],{'개':150}),
 'R108-090020001-0000':(['키위'],{'개':80}),
 'R102-006000049-0000':(['고구마','찐고구마'],{'개':150}),
 'R209-008000546-0000':(['닭가슴살','삶은닭가슴살'],{'개':100}),
 'R105-020000058-0000':(['아몬드'],{'개':1}),
 'R105-035000002-0000':(['호두'],{'개':5}),
 'R108-043020001-0000':(['복숭아'],{'개':150}),
 'R108-038000001-0000':(['배'],{'개':300}),
 'R108-061030001-0000':(['수박'],{'조각':200}),
 'R108-098070001-0000':(['포도'],{'개':5}),
 'D420-762000000-0001':(['카페라테','카페 라떼','라떼'],None),
}
for id,(names,portions) in aliases.items():
 try:alias(id,*names,portions=portions)
 except StopIteration:raise RuntimeError('Missing curated food '+id)
for f in foods.values():
 if f['name']=='쌀밥':f['aliases']=f.get('aliases',[])+['밥','공기밥'];f['serving']=200;f['portions']={'공기':200}
 elif f['name'].startswith('밥 ') or f['name'].endswith('밥'):f.setdefault('portions',{})['공기']=200
 if '김밥' in f['name']:f.setdefault('portions',{})['줄']=f['serving']
 if f['name'] in ['달걀 삶은것','달걀 삶은 것','달걀 삶은달걀','삶은달걀','달걀 전란 삶은것']:
  f['aliases']=f.get('aliases',[])+['계란','달걀','삶은계란','삶은달걀'];f['portions']={'개':50};f['serving']=50
 if '돈가스' in f['name']:f.setdefault('aliases',[]).append(f['name'].replace('돈가스','돈까스'))
 if f['name']=='코카콜라':f['aliases']=['콜라'];f['serving']=200
 if f['name'].replace(' ','')=='코카콜라제로':f['aliases']=['제로콜라'];f['serving']=200
 if f['name']=='칠성사이다':f['aliases']=['사이다'];f['serving']=200
 if f['name']=='포카리스웨트':f['aliases']=['포카리'];f['serving']=200
 if f['name']=='서울우유':f['aliases']=['우유'];f['serving']=200
 if f['name']=='닭튀김':f['aliases']=f.get('aliases',[])+['치킨','후라이드치킨'];f['portions']={'조각':80}
# Search priority is meaningful: everyday aliases first, then dishes, then raw
# ingredients, followed by exact packaged product names.
result=sorted(foods.values(),key=lambda f:(not bool(f.get('aliases')),not f['id'].startswith('D'),f['name']))
output={'source':'식품의약품안전처 식품영양성분DB','downloaded':'2026-10-12','url':'https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do','notes':'음식·원재료·가공식품 DB. 100g 또는 100ml 기준. 인분은 DB 기준량, 개·잔·공기 등은 앱의 중량 가정. 브랜드·조리법·실제 양에 따라 차이가 있으므로 포장지 값을 우선합니다.','foods':result}
path=ROOT/'food-catalog.json';path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print('foods:',len(result),'bytes:',path.stat().st_size)
