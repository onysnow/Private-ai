import json, collections as C, networkx as nx, math, re
S='/tmp/claude-0/-home-claude/e5f07151-37fa-57c0-94f1-8e2294eb6e3e/scratchpad'
d=json.load(open(S+'/1mdb/case_checked.json'))
F=json.load(open(S+'/see_flags.json'))['flags']
E={e['key']:e for e in d['entities']}
cap2key={e['caption']:k for k,e in E.items()}
KIND={'Person':'person','Company':'company','Organization':'org','PublicBody':'org','Vessel':'vehicle','RealEstate':'property','BankAccount':'account','LegalEntity':'other'}
FAM={'Ownership':'owns','Directorship':'runs','Employment':'runs','Payment':'money','UnknownLink':'other'}
flags=C.defaultdict(lambda:{'faint':0,'strong':0,'textbook':0,'items':[]})
miss=set()
for f in F:
  for p in f['parties']:
    k=cap2key.get(p['name'])
    if not k: miss.add(p['name']); continue
    flags[k][f['level']]+=1
    flags[k]['items'].append({'level':f['level'],'id':f['indicator_id'],'text':f['facts'].get('summary','')})
print('unmapped',miss)
# account holders
holder={}
for r in d['relationships']:
  if r['schema']=='Ownership' and E[r['target']]['schema']=='BankAccount': holder[r['target']]=r['source']
deg=C.Counter()
for r in d['relationships']: deg.update([r['source'],r['target']])
def money(r):
  a=r['properties'].get('amount',[None])[0]
  try: return float(a)
  except: return None
links=[]
for i,r in enumerate(d['relationships']):
  p=r['properties']
  ev=r.get('evidence') or []
  links.append({'id':'l%d'%i,'s':r['source'],'t':r['target'],'schema':r['schema'],'fam':FAM.get(r['schema'],'other'),
    'amount':money(r),'cur':(p.get('currency') or [''])[0],'date':(p.get('date') or p.get('startDate') or [''])[0],
    'role':(p.get('role') or p.get('purpose') or [''])[0][:160],'pct':(p.get('percentage') or [''])[0],
    'ev':[{'doc':e['doc'],'loc':e.get('locator',''),'q':e['quote'][:260]} for e in ev[:3]],'note':r.get('note','')[:240]})
# shell chains: companies with exactly 2 links, both ownership, consecutive
G=nx.Graph()
for l in links:
  a=holder.get(l['s'],l['s']); b=holder.get(l['t'],l['t'])
  if a!=b: G.add_edge(a,b)
G.add_nodes_from(k for k in E if k not in holder)
comms=list(nx.algorithms.community.greedy_modularity_communities(G,resolution=1.1))
comm={}
for ci,c in enumerate(comms):
  for n in c: comm[n]=ci
for a,h in holder.items(): comm[a]=comm[h]
terr=[]
for ci,c in enumerate(comms):
  top=sorted(c,key=lambda n:-deg[n])
  fl=sum(flags[n]['faint']+2*flags[n]['strong']+4*flags[n]['textbook'] for n in c if n in flags)
  terr.append({'id':ci,'name':E[top[0]]['caption'].split(' (')[0],'n':len(c),'top':top[:3],'heat':fl})
# layout: community super-layout then local
CG=nx.Graph()
for u,v in G.edges():
  if comm[u]!=comm[v]: CG.add_edge(comm[u],comm[v],weight=CG.get_edge_data(comm[u],comm[v],{'weight':0})['weight']+1)
CG.add_nodes_from(range(len(comms)))
cp=nx.spring_layout(CG,seed=7,k=3.2,weight='weight')
pos={}
for ci,c in enumerate(comms):
  sub=G.subgraph(c)
  lp=nx.spring_layout(sub,seed=3,k=1.6,iterations=200) if len(c)>1 else {list(c)[0]:(0,0)}
  r=0.15+0.065*math.sqrt(len(c))
  for n,(x,y) in lp.items(): pos[n]=(cp[ci][0]*1.0+x*r, cp[ci][1]*0.75+y*r*0.8)
xs=[p[0] for p in pos.values()]; ys=[p[1] for p in pos.values()]
def sc(v,lo,hi,a,b): return a+(v-lo)/(hi-lo)*(b-a)
for n in pos: pos[n]=(round(sc(pos[n][0],min(xs),max(xs),120,2280)),round(sc(pos[n][1],min(ys),max(ys),120,1380)))
for a,h in holder.items(): pos[a]=pos[h]
def shorten(t):
  return t if len(t)<=32 else t[:31].rsplit(' ',1)[0]+'…'
ents=[]
for k,e in E.items():
  fl=flags.get(k)
  ents.append({'id':k,'name':e['caption'],'short':shorten(re.sub(r'\s*\(.*?\)','',e['caption'])),'kind':KIND.get(e['schema'],'other'),'schema':e['schema'],
    'note':e.get('note','')[:220],'deg':deg[k],'holder':holder.get(k),'c':comm.get(k,0),'x':pos[k][0],'y':pos[k][1],
    'jur':(e['properties'].get('jurisdiction') or e['properties'].get('country') or [''])[0],
    'flags':{'faint':fl['faint'],'strong':fl['strong'],'textbook':fl['textbook'],'items':fl['items'][:6]} if fl else None})
ev=[{'date':x['date'],'title':x['title'],'entity':x.get('entity')} for x in d['events']]
out={'entities':ents,'links':links,'territories':terr,'events':ev}
json.dump(out,open(S+'/wire/data.json','w'))
print(len(ents),len(links),[(t['name'],t['n'],t['heat']) for t in terr])
print(sorted(((v['faint']+2*v['strong']+4*v['textbook'],k) for k,v in flags.items()),reverse=True)[:3])
