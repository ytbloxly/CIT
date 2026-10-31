'use strict';

class CITError extends Error {
  constructor(message, line = 1, column = 1) { super(message); this.name = 'CITError'; this.line = line; this.column = column; }
}
const BREAK = Symbol('break'), CONTINUE = Symbol('continue'), RETURN = Symbol('return');

function tokenize(source) {
  const out=[]; let i=0,line=1,col=1;
  const adv=()=>{const c=source[i++]; if(c==='\n'){line++;col=1;}else col++;return c;};
  const add=(type,value,l=line,c=col)=>out.push({type,value,line:l,column:c});
  while(i<source.length){const ch=source[i];
    if(/[ \t\r]/.test(ch)){adv();continue;} if(ch==='\n'){adv();continue;}
    if(ch==='#'){while(i<source.length&&source[i]!=='\n')adv();continue;}
    if(ch==='/'&&source[i+1]==='*'){const l=line,c=col;adv();adv();let ok=false;while(i<source.length){if(source[i]==='*'&&source[i+1]==='/'){adv();adv();ok=true;break;}adv();}if(!ok)throw new CITError('Unterminated block comment.',l,c);continue;}
    const l=line,c=col;
    if(ch==='$'&&source[i+1]==='"'){adv();adv();let v='',ok=false;while(i<source.length){const x=adv();if(x==='\\'){if(i<source.length){const e=adv();v+=({n:'\n',r:'\r',t:'\t','"':'"','\\':'\\'}[e]??e);}}else if(x==='"'){ok=true;break;}else v+=x;}if(!ok)throw new CITError('Unterminated template string.',l,c);add('template',v,l,c);continue;}
    if(ch==='"'||ch==="'"){const q=adv();let v='',ok=false;while(i<source.length){const x=adv();if(x==='\\'){if(i<source.length){const e=adv();v+=({n:'\n',r:'\r',t:'\t','"':'"',"'":"'",'\\':'\\'}[e]??e);}}else if(x===q){ok=true;break;}else{if(x==='\n')throw new CITError('Unterminated string literal.',l,c);v+=x;}}if(!ok)throw new CITError('Unterminated string literal.',l,c);if(q==="'"&&[...v].length!==1)throw new CITError('A char literal must contain exactly one character.',l,c);add(q==='"'?'string':'char',v,l,c);continue;}
    if(/[0-9]/.test(ch)){let v='';while(/[0-9]/.test(source[i]||''))v+=adv();if(source[i]==='.'&&/[0-9]/.test(source[i+1]||'')){v+=adv();while(/[0-9]/.test(source[i]||''))v+=adv();add('float',Number(v),l,c);}else add('int',Number(v),l,c);continue;}
    if(/[A-Za-z_]/.test(ch)){let v='';while(/[A-Za-z0-9_]/.test(source[i]||''))v+=adv();add('identifier',v,l,c);continue;}
    const two=source.slice(i,i+2);if(['==','!=','<=','>=','&&','||','**','//'].includes(two)){adv();adv();add('operator',two,l,c);continue;}
    if('+-*/%<>=!'.includes(ch)){adv();add('operator',ch,l,c);continue;}
    if('(){};,.:'.includes(ch)){adv();add('punctuation',ch,l,c);continue;}
    if(ch==='$'){adv();add('punctuation','$',l,c);continue;}
    throw new CITError(`Unexpected character '${ch}'.`,l,c);
  }
  out.push({type:'eof',value:'',line,column:col});return out;
}

class Parser {
  constructor(tokens){this.tokens=tokens;this.pos=0;}
  cur(){return this.tokens[this.pos];} check(v){return this.cur().value===v;} match(...v){if(v.includes(this.cur().value)){this.pos++;return true;}return false;}
  consume(v,msg){if(this.check(v))return this.tokens[this.pos++];const t=this.cur();throw new CITError(msg||`Expected '${v}', found '${t.value||'end of file'}'.`,t.line,t.column);}
  ident(msg='Expected an identifier.'){const t=this.cur();if(t.type!=='identifier')throw new CITError(msg,t.line,t.column);this.pos++;return t;}
  parse(){const a=[];while(this.cur().type!=='eof')a.push(this.statement());return a;}
  block(){this.consume('{',"Expected '{'.");const a=[];while(!this.check('}')&&this.cur().type!=='eof')a.push(this.statement());this.consume('}',"Expected '}' to close block.");return a;}
  statement(){
    if(this.match(';'))return {kind:'empty'};
    if(this.match('let')){const mutable=this.match('mut'),n=this.ident('Expected variable name after let.');this.consume('=');return {kind:'declare',name:n.value,mutable,expr:this.expression(),token:n};}
    if(['int','float','str','char','bool'].includes(this.cur().value)){const type=this.cur().value;this.pos++;const n=this.ident();this.consume('=');return {kind:'typed',name:n.value,type,expr:this.expression(),token:n};}
    if(this.match('fn')){const n=this.ident('Expected function name.');this.consume('(');const params=[];if(!this.check(')'))do{const p=this.ident('Expected parameter name.');let def=null;if(this.match('='))def=this.expression();params.push({name:p.value,default:def});}while(this.match(','));this.consume(')');return {kind:'function',name:n.value,params,body:this.block(),token:n};}
    if(this.match('class')){const n=this.ident('Expected class name.');this.consume('(');this.consume(')');return {kind:'class',name:n.value,body:this.block(),token:n};}
    if(this.match('if')){this.consume('(');const condition=this.expression();this.consume(')');const yes=this.block(),elseif=[];while(this.match('elseif')){this.consume('(');const c=this.expression();this.consume(')');elseif.push({condition:c,body:this.block()});}const no=this.match('else')?this.block():null;return {kind:'if',condition,yes,elseif,no};}
    if(this.match('while')){this.consume('(');const condition=this.expression();this.consume(')');return {kind:'while',condition,body:this.block()};}
    if(this.match('for')){this.consume('(');this.consume('let',"Expected 'let' in for loop.");const n=this.ident('Expected loop variable.');this.consume(',');this.consume('range',"Expected 'range' in for loop.");this.consume('=');const start=this.expression();this.consume(',');const end=this.expression();this.consume(')');return {kind:'for',name:n.value,start,end,body:this.block(),token:n};}
    if(this.match('import')){const t=this.cur();if(t.type!=='string')throw new CITError("Expected a package or file name in quotes after 'import'.",t.line,t.column);this.pos++;let alias=null;if(this.match('as'))alias=this.ident('Expected a name after \'as\'.').value;return {kind:'import',path:t.value,alias,token:t};}
    if(this.match('return'))return {kind:'return',expr:this.check(';')||this.check('}')?null:this.expression()};
    if(this.match('break'))return {kind:'break'};if(this.match('continue'))return {kind:'continue'};if(this.match('pass'))return {kind:'pass'};
    if(this.check('{'))return {kind:'block',body:this.block()};
    if(['println','errorln','warnln'].includes(this.cur().value)){const kind=this.cur().value;this.pos++;this.consume('(');const args=[];if(!this.check(')'))do{args.push(this.expression());}while(this.match(','));this.consume(')');return {kind,args};}
    if(this.cur().type==='identifier'&&this.tokens[this.pos+1]?.value==='='){const n=this.cur();this.pos+=2;return {kind:'assign',name:n.value,expr:this.expression(),token:n};}
    if(this.cur().type==='identifier'&&this.tokens[this.pos+1]?.value==='.'&&this.tokens[this.pos+3]?.value==='='){const obj=this.cur();this.pos+=2;const prop=this.ident().value;this.consume('=');return {kind:'setprop',object:{kind:'variable',name:obj.value,token:obj},prop,expr:this.expression()};}
    return {kind:'expr',expr:this.expression()};
  }
  expression(){return this.binary(0);}
  binary(min){let left;if(this.match('!','-','+')){const op=this.tokens[this.pos-1].value;left={kind:'unary',op,expr:this.binary(8)};}else left=this.postfix();
    const prec={'||':1,or:1,'&&':2,and:2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'//':6,'%':6,'**':7};
    while(prec[this.cur().value]!==undefined&&prec[this.cur().value]>=min){const op=this.cur().value,p=prec[op];this.pos++;const right=this.binary(p+(op==='**'?0:1));left={kind:'binary',op,left,right};}return left;
  }
  postfix(){let e=this.primary();while(true){if(this.match('.')){e={kind:'member',object:e,name:this.ident('Expected property or method name.').value};continue;}if(this.match('(')){const args=[];if(!this.check(')'))do{let name=null;if(this.cur().type==='identifier'&&this.tokens[this.pos+1]?.value===':'){name=this.cur().value;this.pos+=2;}args.push({name,value:this.expression()});}while(this.match(','));this.consume(')');e={kind:'call',callee:e,args};continue;}break;}return e;}
  primary(){const t=this.cur();if(this.match('true'))return {kind:'literal',value:true};if(this.match('false'))return {kind:'literal',value:false};if(this.match('null'))return {kind:'literal',value:null};if(['int','float','string','char','template'].includes(t.type)){this.pos++;return {kind:'literal',value:t.value,litType:t.type,token:t};}if(this.match('(')){const e=this.expression();this.consume(')');return e;}if(t.type==='identifier'){this.pos++;return {kind:'variable',name:t.value,token:t};}throw new CITError(`Expected expression, found '${t.value||'end of file'}'.`,t.line,t.column);}
}

function typeOf(v){if(v===null)return'null';if(typeof v==='boolean')return'bool';if(typeof v==='number')return Number.isInteger(v)?'int':'float';if(typeof v==='string')return'str';return'unknown';}
function checked(v,t,tok={line:1,column:1}){const actual=typeOf(v);if(actual===t||(t==='float'&&actual==='int'))return v;if(t==='char'&&typeof v==='string'&&[...v].length===1)return v;throw new CITError(`Type mismatch: expected ${t}, received ${actual}.`,tok.line,tok.column);}
const truthy=v=>v!==false&&v!==null&&v!==0&&v!=='';
class Env{constructor(parent=null){this.parent=parent;this.values=new Map();}find(n){if(this.values.has(n))return this;if(this.parent)return this.parent.find(n);return null;}get(n,tok){const e=this.find(n);if(!e)throw new CITError(`Undefined variable '${n}'.`,tok?.line||1,tok?.column||1);return e.values.get(n).value;}define(n,v,mutable=true,type=typeOf(v),tok={line:1,column:1}){if(this.values.has(n))throw new CITError(`'${n}' is already declared.`,tok.line,tok.column);this.values.set(n,{value:v,mutable,type});}set(n,v,tok={line:1,column:1}){const e=this.find(n);if(!e)throw new CITError(`Undefined variable '${n}'.`,tok.line,tok.column);const x=e.values.get(n);if(!x.mutable)throw new CITError(`Cannot reassign immutable variable '${n}'. Use 'let mut'.`,tok.line,tok.column);x.value=checked(v,x.type,tok);}}

async function run(source, output=()=>{}, input=async prompt=>'', options={}){
 const ast=new Parser(tokenize(source)).parse(),global=new Env();const maxSteps=options.maxSteps||1000000;let steps=0;
 const emit=(kind,msg)=>{const line=String(msg);if(kind==='errorln')output(`[ERROR] ${line}`,'error');else if(kind==='warnln')output(`[WARNING] ${line}`,'warn');else output(line,'out');};
 const cancelled=()=>typeof options.isCancelled==='function'&&options.isCancelled();
 let currentDir=options.baseDir||null;const moduleCache=new Map(),loading=new Set();
 async function ev(e,env){switch(e.kind){case'literal':if(e.litType==='template')return await template(e.value,env);return e.value;case'variable':return env.get(e.name,e.token);case'member':{const o=await ev(e.object,env);if(o==null)throw new CITError(`Cannot read '${e.name}' from null.`);if(o.__module&&!(e.name in o))throw new CITError(`Module '${o.__module}' has no export '${e.name}'.`);return o[e.name];}case'unary':{const v=await ev(e.expr,env);if(e.op==='!')return!truthy(v);if(typeof v!=='number')throw new CITError(`Unary '${e.op}' requires a number.`);return e.op==='-'?-v:v;}case'binary':{const a=await ev(e.left,env);if(e.op==='&&'||e.op==='and')return truthy(a)&&truthy(await ev(e.right,env));if(e.op==='||'||e.op==='or')return truthy(a)||truthy(await ev(e.right,env));const b=await ev(e.right,env);switch(e.op){case'+':if(typeof a==='string'&&typeof b==='string')return a+b;if(typeof a==='number'&&typeof b==='number')return a+b;break;case'-':return a-b;case'*':return a*b;case'/':if(b===0)throw new CITError('Division by zero.');return a/b;case'//':if(b===0)throw new CITError('Division by zero.');return Math.floor(a/b);case'%':if(b===0)throw new CITError('Division by zero.');return ((a%b)+b)%b;case'**':return a**b;case'==':return a===b;case'!=':return a!==b;case'<':return a<b;case'>':return a>b;case'<=':return a<=b;case'>=':return a>=b;}throw new CITError(`Invalid operands for '${e.op}'.`);}case'call':return await call(e,env);default:throw new CITError('Invalid expression.');}}
 async function template(s,env){return s.replace(/\$\{([^{}]+)\}/g,(_m,expr)=>'').replace(/\{([^{}]+)\}/g,(_m,expr)=>'');}
 // Interpolate template expressions in a second pass; braces are expressions, not literal text.
 async function interpolate(s,env){let result='',i=0;while(i<s.length){if(s[i]==='{'){const end=s.indexOf('}',i+1);if(end>=0){const expr=s.slice(i+1,end);const value=await ev(new Parser(tokenize(expr)).expression(),env);result+=value==null?'null':String(value);i=end+1;continue;}}result+=s[i++];}return result;}
 async function call(e,env){if(e.callee.kind==='variable'){const name=e.callee.name;const vals=[];for(const a of e.args)vals.push({name:a.name,value:await ev(a.value,env)});
   if(name==='input'){const prompt=vals.length?String(vals[0].value):'';return String(await input(prompt));}
   if(name==='castInt')return Math.trunc(Number(vals[0]?.value));if(name==='castFloat')return Number(vals[0]?.value);if(name==='castString')return String(vals[0]?.value);if(name==='castBool'){const x=vals[0]?.value;if(typeof x==='string'){const z=x.trim().toLowerCase();if(['false','0','no','off',''].includes(z))return false;if(['true','1','yes','on'].includes(z))return true;}return truthy(x);}
   const target=env.get(name,e.callee.token);if(target?.kind==='class')return construct(target,vals,env);if(target?.kind==='function')return await invoke(target,vals,env);throw new CITError(`'${name}' is not callable.`);
  }
  if(e.callee.kind==='member'){const obj=await ev(e.callee.object,env),fn=obj?.[e.callee.name];if(typeof fn!=='function')throw new CITError(`'${e.callee.name}' is not a method.`);const vals=[];for(const a of e.args)vals.push(await ev(a.value,env));return await fn(...vals);}
  throw new CITError('This expression cannot be called.');}
 async function invoke(fn,args,parent){const local=new Env(fn.closure||parent);let pos=0;for(const p of fn.params){const named=args.find(a=>a.name===p.name);let v;if(named)v=named.value;else if(pos<args.length&&!args[pos].name)v=args[pos++].value;else if(p.default!==null)v=await ev(p.default,local);else throw new CITError(`Missing argument '${p.name}'.`);local.define(p.name,v,false);}const r=await exec(fn.body,local);return r&&r.type===RETURN?r.value:null;}
 async function construct(cls,args,env){const instance={__class:cls.name};for(const [n,m] of Object.entries(cls.methods))instance[n]=async(...raw)=>{const vals=raw.map(value=>({name:null,value}));return await invoke(m,vals,instanceEnv);};const instanceEnv=new Env(env);instanceEnv.define('self',instance,false);const init=cls.methods.struct;if(init)await invoke(init,args,instanceEnv);return instance;}
 function defaultAlias(spec){let a=String(spec).split(/[\\/]/).filter(Boolean).pop()||'module';a=a.replace(/\.(cit|ct)$/,'').replace(/[^A-Za-z0-9_]/g,'_');return /^[0-9]/.test(a)?'_'+a:a;}
 async function loadModule(spec,tok){
  if(typeof options.resolveModule!=='function')throw new CITError('Imports are not available in this environment.',tok.line,tok.column);
  let r;try{r=options.resolveModule(spec,currentDir);}catch(err){throw new CITError(err.message,tok.line,tok.column);}
  if(moduleCache.has(r.filename))return moduleCache.get(r.filename);
  if(loading.has(r.filename))throw new CITError(`Circular import of '${spec}'.`,tok.line,tok.column);
  loading.add(r.filename);const prevDir=currentDir;currentDir=r.dir;
  try{
   const menv=new Env(null);
   try{await exec(new Parser(tokenize(r.source)).parse(),menv);}
   catch(err){if(err instanceof CITError&&!err.inModule){err.message=`In '${spec}' (line ${err.line}): ${err.message}`;err.line=tok.line;err.column=tok.column;err.inModule=true;}throw err;}
   const mod={};Object.defineProperty(mod,'__module',{value:spec,enumerable:false});
   for(const [n,x] of menv.values){const v=x.value;
    if(v&&v.kind==='function')mod[n]=async(...raw)=>invoke(v,raw.map(value=>({name:null,value})),menv);
    else if(v&&v.kind==='class')mod[n]=async(...raw)=>construct(v,raw.map(value=>({name:null,value})),menv);
    else mod[n]=v;}
   moduleCache.set(r.filename,mod);return mod;
  }finally{loading.delete(r.filename);currentDir=prevDir;}
 }
 async function exec(list,env){for(const s of list){if(cancelled())throw new CITError('Execution cancelled.');if(++steps>maxSteps)throw new CITError('Execution step limit exceeded. Possible infinite loop.');let v;switch(s.kind){case'empty':case'pass':break;case'block':{const r=await exec(s.body,new Env(env));if(r)return r;break;}case'declare':v=await ev(s.expr,env);env.define(s.name,v,s.mutable,typeOf(v),s.token);break;case'typed':v=await ev(s.expr,env);env.define(s.name,checked(v,s.type,s.token),false,s.type,s.token);break;case'assign':env.set(s.name,await ev(s.expr,env),s.token);break;case'setprop':{const o=await ev(s.object,env);o[s.prop]=await ev(s.expr,env);break;}case'println':case'errorln':case'warnln':emit(s.kind,(await Promise.all(s.args.map(a=>ev(a,env)))).map(v=>v==null?'null':String(v)).join(' '));break;case'expr':await ev(s.expr,env);break;case'function':env.define(s.name,{kind:'function',params:s.params,body:s.body,closure:env},false,'function',s.token);break;case'class':{const methods={};for(const m of s.body){if(m.kind!=='function')throw new CITError('Only methods can be declared directly inside a class.');methods[m.name]={kind:'function',params:m.params,body:m.body,closure:null};}env.define(s.name,{kind:'class',name:s.name,methods},false,'class',s.token);break;}case'if':{let chosen=truthy(await ev(s.condition,env))?s.yes:null;if(!chosen)for(const b of s.elseif)if(truthy(await ev(b.condition,env))){chosen=b.body;break;}if(!chosen)chosen=s.no;if(chosen){const r=await exec(chosen,new Env(env));if(r)return r;}break;}case'while':while(truthy(await ev(s.condition,env))){if(++steps>maxSteps)throw new CITError('Loop limit exceeded.');const r=await exec(s.body,new Env(env));if(r?.type===BREAK)break;if(r?.type===CONTINUE)continue;if(r)return r;}break;case'for':{const start=Number(await ev(s.start,env)),end=Number(await ev(s.end,env));if(!Number.isInteger(start)||!Number.isInteger(end))throw new CITError('for range values must be integers.');for(let i=start;i<end;i++){if(++steps>maxSteps)throw new CITError('Loop limit exceeded.');const loopEnv=new Env(env);loopEnv.define(s.name,i,false,'int',s.token);const r=await exec(s.body,loopEnv);if(r?.type===BREAK)break;if(r?.type===CONTINUE)continue;if(r)return r;}break;}case'import':{const mod=await loadModule(s.path,s.token);env.define(s.alias||defaultAlias(s.path),mod,false,'module',s.token);break;}case'break':return{type:BREAK};case'continue':return{type:CONTINUE};case'return':return{type:RETURN,value:s.expr?await ev(s.expr,env):null};}}
  return null;}
 // Rebind template evaluation to the expression interpolator.
 const originalEv=ev; ev=async(e,env)=>{if(e.kind==='literal'&&e.litType==='template')return interpolate(e.value,env);return originalEv(e,env);};
 await exec(ast,global);return global;
}

function compileBytecode(source){return {version:2,format:'CIT-VM-SOURCE-BUNDLE',source};}
async function executeBytecode(program,output=()=>{},input=async()=> '',options={}){if(!program||program.version!==2||typeof program.source!=='string')throw new CITError('Unsupported or invalid CIT bytecode bundle.');return run(program.source,output,input,options);}
module.exports={CITError,tokenize,Parser,run,compileBytecode,executeBytecode};
