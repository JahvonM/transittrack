import json
from pathlib import Path
root=Path('/app')
schemas={p.stem:json.loads(p.read_text()) for p in (root/'base44/entities').glob('*.jsonc')}
maintenance=['Vehicle','Fault','Inspection','InspectionResult','InspectionTemplate','Part','MaintenanceSchedule','MaintenanceSettings']
public=['Advertisement']
protected=['DeviceCredential','DriverPinCredential','PassengerOneTimeCredential','VerificationGrant','VerificationAttempt','CompanyAccessGrant','JobRun']
exposed=[n for n in schemas if n not in protected]
props={n:list(schemas[n].get('properties',{})) for n in exposed}
policy='const ENTITY_FIELDS = '+json.dumps(props)+';\nconst MAINTENANCE = new Set('+json.dumps(maintenance)+');\n'
(root/'tmp-step5-policy.txt').write_text(policy)
# The platform User entity has immutable built-in permission rules; do not pretend schema rules fix it.
for n,s in schemas.items():
 if n=='User':continue
 s['rls']={op:{'user_condition':{'role':'admin'}} for op in ['read','create','update','delete']}
 if n=='Advertisement':s['rls']['read']={}
 (root/f'base44/entities/{n}.jsonc').write_text(json.dumps(s,indent=2))
s={'name':'CompanyMembership','type':'object','properties':{'user_id':{'type':'string'},'company_id':{'type':'string'},'scope':{'type':'string','enum':['manager','passenger']},'active':{'type':'boolean'}},'required':['user_id','company_id','scope','active'],'rls':{op:{'user_condition':{'role':'admin'}} for op in ['read','create','update','delete']}}
(root/'base44/entities/CompanyMembership.jsonc').write_text(json.dumps(s,indent=2))
