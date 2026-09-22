'use client';
// Operator console: one page that shows the whole backend -- database tables on
// any dialect (including the SQLite file the Windows launcher uses, which
// Adminer cannot open), read-only SQL, the complete route table with live
// probes, the real test suite run against an isolated database, the structured
// application log, and the security alert surface. Loopback-only on the API side.
import {useCallback,useEffect,useState} from 'react';
import type {ChangeEvent,ReactElement} from 'react';

import type {ConsoleOverview,ConsoleTable,ConsoleTableRows,ConsoleSqlResult,ConsoleRoute,ConsoleProbeReport,ConsoleTestStatus,ConsoleLogView,SecurityAlerts} from '../../lib/api-types';
import {isConsoleOverview,isConsoleTable,isConsoleTableRows,isConsoleSqlResult,isConsoleRoute,isConsoleProbeReport,isConsoleTestStatus,isConsoleLogView,isSecurityAlerts} from '../../lib/api-validate';
import {ApiClient,errorMessage} from '../../lib/api-client';
import Link from 'next/link';

import {Button} from '@/components/ui/button';

const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
const api=new ApiClient(API);
const cell=(v:unknown):string=>v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
const absolute=(path:string):string=>path.startsWith('http')?path:`${API}${path}`;

export default function ConsolePage(): ReactElement {
  const [overview,setOverview]=useState<ConsoleOverview|null>(null);
  const [overviewError,setOverviewError]=useState('');
  const [tables,setTables]=useState<ConsoleTable[]>([]);
  const [tableName,setTableName]=useState('');
  const [rows,setRows]=useState<ConsoleTableRows|null>(null);
  const [rowsError,setRowsError]=useState('');
  const [sql,setSql]=useState('SELECT name, created_at FROM investigations ORDER BY created_at DESC');
  const [sqlResult,setSqlResult]=useState<ConsoleSqlResult|null>(null);
  const [sqlError,setSqlError]=useState('');
  const [routes,setRoutes]=useState<ConsoleRoute[]>([]);
  const [routeFilter,setRouteFilter]=useState('');
  const [probe,setProbe]=useState<ConsoleProbeReport|null>(null);
  const [probeError,setProbeError]=useState('');
  const [tests,setTests]=useState<ConsoleTestStatus|null>(null);
  const [testSelection,setTestSelection]=useState('');
  const [testsError,setTestsError]=useState('');
  const [logs,setLogs]=useState<ConsoleLogView|null>(null);
  const [logLevel,setLogLevel]=useState('');
  const [logContains,setLogContains]=useState('');
  const [logsError,setLogsError]=useState('');
  const [security,setSecurity]=useState<SecurityAlerts|null>(null);

  const loadOverview=useCallback(async()=>{
    try{setOverview(await api.object('/api/console/overview','console overview',isConsoleOverview));setOverviewError('')}
    catch(error){setOverviewError(errorMessage(error,'Console unavailable'))}
  },[]);
  const loadTables=useCallback(async()=>{
    try{const body=await api.unknown('/api/console/tables');const list=(body as {tables?:unknown}).tables;setTables(Array.isArray(list)?list.filter(isConsoleTable):[])}
    catch(error){setRowsError(errorMessage(error,'Could not list tables'))}
  },[]);
  const loadRows=useCallback(async(name:string,offset=0)=>{
    if(!name)return;
    try{setRows(await api.object(`/api/console/tables/${encodeURIComponent(name)}?limit=50&offset=${offset}`,'table rows',isConsoleTableRows));setRowsError('')}
    catch(error){setRows(null);setRowsError(errorMessage(error,'Could not read table'))}
  },[]);
  const loadRoutes=useCallback(async()=>{
    try{const body=await api.unknown('/api/console/routes');const list=(body as {routes?:unknown}).routes;setRoutes(Array.isArray(list)?list.filter(isConsoleRoute):[])}catch{setRoutes([])}
  },[]);
  const loadTests=useCallback(async()=>{
    try{setTests(await api.object('/api/console/tests/status?tail_lines=60','test status',isConsoleTestStatus))}catch(error){setTestsError(errorMessage(error,'Could not read test status'))}
  },[]);
  const loadLogs=useCallback(async()=>{
    const params=new URLSearchParams({limit:'100'});if(logLevel)params.set('level',logLevel);if(logContains.trim())params.set('contains',logContains.trim());
    try{setLogs(await api.object(`/api/console/logs?${params}`,'log view',isConsoleLogView));setLogsError('')}catch(error){setLogsError(errorMessage(error,'Could not read the log'))}
  },[logLevel,logContains]);
  const loadSecurity=useCallback(async()=>{
    try{setSecurity(await api.object('/api/settings/security/alerts?window_hours=24&max_examples=5','security alerts',isSecurityAlerts))}catch{setSecurity(null)}
  },[]);

  useEffect(()=>{void loadOverview();void loadTables();void loadRoutes();void loadTests();void loadLogs();void loadSecurity()},[loadOverview,loadTables,loadRoutes,loadTests,loadLogs,loadSecurity]);
  useEffect(()=>{if(!tests||tests.status!=='running')return;const t=setInterval(()=>{void loadTests()},2000);return()=>clearInterval(t)},[tests,loadTests]);

  const runSql=async()=>{try{setSqlResult(await api.object('/api/console/sql','sql result',isConsoleSqlResult,{method:'POST',body:{sql,max_rows:200}}));setSqlError('')}catch(error){setSqlResult(null);setSqlError(errorMessage(error,'Query refused'))}};
  const runProbe=async()=>{try{setProbe(await api.object('/api/console/checks/endpoints','probe report',isConsoleProbeReport,{method:'POST'}));setProbeError('')}catch(error){setProbeError(errorMessage(error,'Probe failed'))}};
  const runTests=async()=>{try{setTests(await api.object('/api/console/tests/run','test status',isConsoleTestStatus,{method:'POST',body:{selection:testSelection.trim()||null}}));setTestsError('')}catch(error){setTestsError(errorMessage(error,'Could not start the test run'))}};
  const cancelTests=async()=>{try{setTests(await api.object('/api/console/tests/cancel','test status',isConsoleTestStatus,{method:'POST'}))}catch(error){setTestsError(errorMessage(error,'Could not cancel'))}};

  const visibleRoutes=routes.filter(r=>!routeFilter.trim()||`${r.methods.join(' ')} ${r.path} ${r.summary}`.toLowerCase().includes(routeFilter.trim().toLowerCase()));

  return <main className="shell">
    <div className="top"><strong>JOURNALISM WORKBENCH · BACKEND CONSOLE</strong><Link className="badge" href="/">← workbench</Link></div>
    <p className="muted">Everything on this page is served only to the local machine. Reading is unrestricted; changes to data go through Adminer, and the test runner uses its own database.</p>

    <section className="card" data-testid="console-overview"><h3>Status</h3>
      {overviewError&&<p className="muted">{overviewError}</p>}
      {overview&&<>
        <div><b>Database:</b> {overview.database.url} · {overview.database.dialect} · {overview.database.live_tables}/{overview.database.modeled_tables} tables{overview.database.missing_tables.length?` · missing: ${overview.database.missing_tables.join(', ')}`:''}{overview.database.extra_tables.length?` · not modeled: ${overview.database.extra_tables.join(', ')}`:''}</div>
        {!overview.database.adminer_can_open&&<div className="muted">This is a SQLite database, so Adminer cannot open it; browse and query it below instead. Run the backend against Docker Postgres to edit rows in Adminer.</div>}
        <div><b>Python</b> {overview.python} · pytest {overview.pytest_available?'available':'not installed (pip install -r requirements-test.txt)'} · log {overview.app_log_file}</div>
        <div className="actions">
          <a href={absolute(overview.links.swagger)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Swagger (try any endpoint)</Button></a>
          <a href={absolute(overview.links.redoc)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">ReDoc</Button></a>
          <a href={overview.links.adminer} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Adminer (edit rows)</Button></a>
          {overview.links.openaleph_ui&&<a href={overview.links.openaleph_ui} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">OpenAleph UI</Button></a>}
          <Button size="sm" variant="outline" onClick={()=>{void loadOverview();void loadTables();void loadSecurity()}}>Refresh</Button>
        </div>
      </>}
      {security&&<div className="muted" data-testid="console-security">{security.needs_attention?'⚠ ':''}Access denials, last 24h: {security.total_denials}{security.by_event.auth_rate_limited?` · ${security.by_event.auth_rate_limited} lockout(s)`:''}{security.remote_hosts[0]?` · busiest host ${security.remote_hosts[0].client_host} (${security.remote_hosts[0].count})`:''}</div>}
    </section>

    <section className="card" data-testid="console-tables"><h3>Tables</h3>
      <p className="muted">Every modeled table with its live row count. Click one to page through rows, newest first.</p>
      <div className="actions">{tables.map(t=><Button key={t.name} size="sm" variant={t.name===tableName?'default':'outline'} onClick={()=>{setTableName(t.name);void loadRows(t.name)}}>{t.name} <small>({t.rows})</small></Button>)}</div>
      {rowsError&&<p className="muted">{rowsError}</p>}
      {rows&&<div>
        <div className="muted">{rows.table}: {rows.total} row(s), showing {rows.offset+1}–{rows.offset+rows.returned}{' '}
          <Button size="sm" variant="outline" disabled={rows.offset===0} onClick={()=>void loadRows(rows.table,Math.max(0,rows.offset-rows.limit))}>Prev</Button>{' '}
          <Button size="sm" variant="outline" disabled={rows.offset+rows.returned>=rows.total} onClick={()=>void loadRows(rows.table,rows.offset+rows.limit)}>Next</Button></div>
        <div style={{overflowX:'auto'}}><table><thead><tr>{rows.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.rows.map((r,i)=><tr key={i}>{rows.columns.map(c=><td key={c} title={cell(r[c])}>{cell(r[c]).slice(0,120)}</td>)}</tr>)}</tbody></table></div>
      </div>}
    </section>

    <section className="card" data-testid="console-sql"><h3>Read-only SQL</h3>
      <p className="muted">One SELECT / WITH / EXPLAIN at a time, capped at 200 rows, always rolled back. Writes are refused here on purpose — use Adminer.</p>
      <textarea aria-label="SQL" value={sql} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setSql(e.target.value)} rows={3} style={{width:'100%',fontFamily:'monospace'}}/>
      <div className="actions"><Button onClick={runSql}>Run query</Button></div>
      {sqlError&&<p className="muted" data-testid="console-sql-error">{sqlError}</p>}
      {sqlResult&&<div><div className="muted">{sqlResult.returned} row(s){sqlResult.truncated?' (truncated)':''} in {sqlResult.duration_ms} ms</div>
        <div style={{overflowX:'auto'}}><table><thead><tr>{sqlResult.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{sqlResult.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} title={cell(v)}>{cell(v).slice(0,120)}</td>)}</tr>)}</tbody></table></div></div>}
    </section>

    <section className="card" data-testid="console-endpoints"><h3>Endpoints</h3>
      <p className="muted">{routes.length} routes. Filter the table, or probe the id-free GET endpoints live and see status and latency; anything with an id is one click away in Swagger.</p>
      <div className="searchrow"><input aria-label="Route filter" value={routeFilter} onChange={(e:ChangeEvent<HTMLInputElement>)=>setRouteFilter(e.target.value)} placeholder="filter: investigations, POST, candidates…"/><Button onClick={runProbe}>Probe endpoints</Button></div>
      {probeError&&<p className="muted">{probeError}</p>}
      {probe&&<div data-testid="console-probe"><div className="muted">{probe.ok}/{probe.checked} answered 2xx at {probe.at.replace('T',' ').slice(0,19)}</div>
        {probe.results.map(r=><div key={r.path}><small>{r.ok?'✓':'✗'} {r.method} {r.path} → {r.status_code??'no response'} · {r.duration_ms} ms{r.error?` · ${r.error}`:''}</small></div>)}</div>}
      <div style={{maxHeight:320,overflowY:'auto'}}><table><thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead><tbody>{visibleRoutes.map(r=><tr key={`${r.methods.join(',')} ${r.path}`}><td>{r.methods.join(', ')}</td><td><code>{r.path}</code></td><td>{r.summary}</td></tr>)}</tbody></table></div>
    </section>

    <section className="card" data-testid="console-tests"><h3>Tests</h3>
      <p className="muted">Runs the backend&apos;s own pytest suite in a subprocess against an isolated SQLite database under data/console — never the workbench data. Leave the selection empty for the whole suite, or give a test path / -k expression.</p>
      <div className="searchrow"><input aria-label="Test selection" value={testSelection} onChange={(e:ChangeEvent<HTMLInputElement>)=>setTestSelection(e.target.value)} placeholder="tests/test_reasoning_endpoints.py or -k search"/>
        <Button onClick={runTests} disabled={tests?.status==='running'}>{tests?.status==='running'?'Running…':'Run tests'}</Button>{tests?.status==='running'&&<Button variant="outline" onClick={cancelTests}>Cancel</Button>}<Button variant="outline" onClick={()=>void loadTests()}>Refresh</Button></div>
      {testsError&&<p className="muted">{testsError}</p>}
      {tests&&tests.status!=='idle'&&<div data-testid="console-test-status">
        <div><b>{tests.status}</b>{tests.summary?` · ${tests.summary}`:''}{tests.started_at?` · started ${tests.started_at.replace('T',' ').slice(0,19)}`:''}{tests.database_url?` · db ${tests.database_url}`:''}</div>
        {tests.failed_tests&&tests.failed_tests.length>0&&<div>{tests.failed_tests.map(f=><div key={f}><small>{f}</small></div>)}</div>}
        {tests.tail&&<pre style={{whiteSpace:'pre-wrap',fontSize:12,maxHeight:260,overflowY:'auto'}}>{tests.tail.join('\n')}</pre>}
      </div>}
    </section>

    <section className="card" data-testid="console-logs"><h3>Application log</h3>
      <p className="muted">Every request with its status and duration, and every unhandled error with its traceback, under the request id the client received. Search by that id when something 500s.</p>
      <div className="searchrow"><select aria-label="Log level" value={logLevel} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setLogLevel(e.target.value)}><option value="">all levels</option><option>ERROR</option><option>WARNING</option><option>INFO</option></select>
        <input aria-label="Log search" value={logContains} onChange={(e:ChangeEvent<HTMLInputElement>)=>setLogContains(e.target.value)} placeholder="request id, path, text…"/><Button onClick={()=>void loadLogs()}>Search</Button></div>
      {logsError&&<p className="muted">{logsError}</p>}
      {logs&&<div><div className="muted">{logs.returned} record(s){logs.truncated?' · only the newest 8 MB scanned':''}</div>
        <div style={{maxHeight:360,overflowY:'auto'}}>{logs.records.map((r,i)=><div key={i}><small><code>{cell(r.ts).replace('T',' ').slice(0,19)}</code> {cell(r.level)} {cell(r.message)}{r.request_id?<> · <code>{cell(r.request_id)}</code></>:null}</small>{r.exception?<pre style={{whiteSpace:'pre-wrap',fontSize:11}}>{cell(r.exception)}</pre>:null}</div>)}</div></div>}
    </section>
  </main>;
}
