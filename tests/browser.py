import json,os,select,subprocess,sys
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

root=Path(__file__).resolve().parents[1]
os.chdir(root)
output=root/'artifacts'/'browser'
output.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tests/browser-server.ts'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
try:
 if not select.select([server.stdout],[],[],15)[0]:
  raise RuntimeError('Browser fixture server did not start')
 ready=server.stdout.readline()
 base='http://127.0.0.1:'+str(json.loads(ready)['port'])
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--disable-dev-shm-usage'],**({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
  context=browser.new_context(viewport={'width':1280,'height':1120},locale='zh-CN',timezone_id='UTC')
  context.add_cookies([{'name':'qa_admin','value':'1','domain':'127.0.0.1','path':'/','httpOnly':True,'sameSite':'Lax'}])
  page=context.new_page();errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url))
  page.goto(base+'/admin/plugins/config',wait_until='networkidle')
  frame=page.frame_locator('iframe[title="监控日报与周报：发送与记录"]')
  expect(frame.locator('#status')).to_contain_text('版本')
  assert page.locator('iframe').get_attribute('src') is None
  frame.locator('#kind').select_option('weekly');frame.locator('#date').fill('2099-01-01')
  frame.get_by_role('button',name='发送今日日报',exact=True).click()
  expect(frame.locator('#message')).to_contain_text('操作已完成',timeout=15000)
  state=context.request.get(base+'/__qa/state').json()
  assert len(state['records'])==1 and state['records'][0]['manual'] is True
  first=state['records'][0]
  expected=datetime.fromtimestamp(first['generated']/1000,ZoneInfo('Asia/Shanghai')).replace(hour=0,minute=0,second=0,microsecond=0)
  assert first['period']['start']==int(expected.timestamp()*1000)
  assert first['period']['end']==first['generated']
  assert first['kind']=='daily' and first['status']=='accepted'
  assert any(call['method']=='public:queryMetrics' and call['params']['end']==datetime.fromtimestamp(first['period']['end']/1000,ZoneInfo('UTC')).isoformat(timespec='milliseconds').replace('+00:00','Z') for call in state['calls'])
  first_token=state['csrfToken']
  page.get_by_label('报告时区',exact=True).fill('UTC')
  page.get_by_role('button',name='保存配置',exact=True).click()
  expect(page.locator('#saved')).to_have_text('配置已保存')
  frame.get_by_role('button',name='发送今日日报',exact=True).click()
  expect(frame.locator('#message')).to_contain_text('操作已完成',timeout=15000)
  state=context.request.get(base+'/__qa/state').json()
  assert len(state['records'])==2 and state['csrfToken']!=first_token
  last=max(state['records'],key=lambda record:record['generated'])
  expected=datetime.fromtimestamp(last['generated']/1000,ZoneInfo('UTC')).replace(hour=0,minute=0,second=0,microsecond=0)
  assert last['period']['start']==int(expected.timestamp()*1000)
  assert last['period']['end']==last['generated'] and last['manual'] is True
  actions=[r for r in state['requests'] if r['method']=='POST' and r['url'].endswith('/action')]
  assert len(actions)==2 and all(r['body']=={'action':'sendToday'} for r in actions)
  assert all(r['site']=='same-origin' for r in actions)
  for path in ['/api/admin/plugin/komari-daily-weekly-reports/pages/admin.html','/api/admin/plugin/komari-daily-weekly-reports/src/admin-console.html']:
   assert context.request.get(base+path).status==404
  denied=context.request.post(base+'/api/plugins/komari-daily-weekly-reports/action',data={'action':'sendToday'},headers={'Sec-Fetch-Site':'cross-site','X-Komari-Reports-CSRF':state['csrfToken']})
  assert denied.status==403
  anonymous=browser.new_context()
  assert anonymous.request.get(base+'/admin/plugins/config').status==401
  assert anonymous.request.post(base+'/api/plugins/komari-daily-weekly-reports/action',data={'action':'sendToday'},headers={'X-Komari-Reports-CSRF':state['csrfToken']}).status==403
  anonymous.close()
  assert not errors,errors
  assert not any('/pages/admin.html' in url for url in requests)
  page.screenshot(path=str(output/'desktop.png'),full_page=True)
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert frame.locator('body').evaluate('(body)=>body.ownerDocument.documentElement.scrollWidth<=body.ownerDocument.defaultView.innerWidth')
  page.screenshot(path=str(output/'mobile.png'),full_page=True)
  result={'browser':'Chromium','native_configuration_embed':'passed','today_report_and_metric_range':'passed','configuration_reload_and_token_rotation':'passed','standalone_pages':'404','anonymous_and_cross_site_requests':'rejected','desktop_and_mobile_layout':'passed','reports_sent_to_mock_channel':len(state['records'])}
  (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print(json.dumps(result,ensure_ascii=False))
  browser.close()

finally:
 server.terminate()
 try:
  server.wait(timeout=10)
 except subprocess.TimeoutExpired:
  server.kill()
  server.wait()
