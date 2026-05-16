import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from './index.js';
test('server registers launchers and composes manifests', async () => { Server.register({name:'x',version:'1',health:()=>({name:'x',status:'ok',checkedAt:new Date().toISOString()}),launcher:()=>({packageName:'x',title:'x',mode:'stub',status:'ready',checkedAt:new Date().toISOString(),summary:'x',actions:[]})}); const launchers=await Server.launchers(); assert.equal(launchers.length>=1,true); assert.equal(Server.mcpManifest().packages.length>=1,true); });
