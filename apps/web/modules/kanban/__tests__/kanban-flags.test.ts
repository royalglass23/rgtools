import { describe, expect, it } from 'vitest'
import { parseFlagManifest, planFlagImport, readImportedFlags, importedFlagForJob } from '../kanban-flags'
import { resolveProductPlanning } from '../assessment'
import { parseManualState } from '../work-orders'
const id='40600000-0000-4000-8000-000000000010', jobUuid='source-job'
const source={ spreadsheetId:'synthetic-sheet-id-123456',sheetId:1,sheet:'Master',modifiedAt:'2026-11-16T00:00:00Z',retrievedAt:'2026-11-17T00:00:00Z',ranges:['A1:B1000','AR1:AR1000'] }
const manifest=()=>({version:1,source,rows:[{row:5,jobNumber:'TEST406',flag:'Y',cell:'AR5'}]})
describe('Kanban Master flag transfer and precedence',()=>{
  it('matches exactly one current job, keeps source provenance and rejects ambiguous or invalid flags',()=>{
    const parsed=parseFlagManifest(manifest()),inventory=[{id,jobNumber:'TEST406',jobUuid,products:2,overrides:1}]
    expect(planFlagImport(parsed,inventory)).toMatchObject({matched:[{jobId:id,flag:'Y',products:2,overrides:1}],unmatched:[],ambiguous:[]})
    expect(planFlagImport(parsed,[...inventory,{...inventory[0],id:'other'}]).ambiguous).toEqual(['TEST406'])
    expect(planFlagImport(parsed,[]).unmatched).toEqual(['TEST406'])
    expect(()=>parseFlagManifest({...manifest(),rows:[...manifest().rows,...manifest().rows]})).toThrow(/duplicate/i)
    expect(()=>parseFlagManifest({...manifest(),rows:[{...manifest().rows[0],flag:'yes'}]})).toThrow(/flag/i)
  })
  it('inherits Y/N/? independently of date and gives every product override priority',()=>{
    const auto=parseManualState({})
    expect(resolveProductPlanning(null,auto,null,false,'2026-11-17','Y')).toMatchObject({inDueWindow:true,focus:'included'})
    expect(resolveProductPlanning('2026-11-20',auto,null,false,'2026-11-17','N').inDueWindow).toBe(false)
    expect(resolveProductPlanning('2026-11-20',auto,null,false,'2026-11-17','?')).toMatchObject({inDueWindow:false,focus:'unknown'})
    expect(resolveProductPlanning(null,parseManualState({focus:'exclude'}),null,false,'2026-11-17','Y').inDueWindow).toBe(false)
    expect(resolveProductPlanning(null,parseManualState({focus:'include'}),null,false,'2026-11-17','N').inDueWindow).toBe(true)
    expect(resolveProductPlanning(null,parseManualState({focus:'unknown'}),null,false,'2026-11-17','Y').inDueWindow).toBe(false)
  })
  it('never applies a saved flag to a different job identity or accepts corrupt setting content',()=>{
    const entry={jobId:id,jobNumber:'TEST406',jobUuid,flag:'Y',sourceCell:'AR5',source,sourceHash:'hash',importedAt:'2026-11-17T00:00:00Z'}
    const state=readImportedFlags(JSON.stringify({version:1,entries:{[id]:entry}}))
    expect(importedFlagForJob(state,{id,jobNumber:'TEST406',jobUuid})?.flag).toBe('Y')
    expect(importedFlagForJob(state,{id,jobNumber:'TEST406',jobUuid:'different'})).toBeNull()
    expect(()=>readImportedFlags('{bad json}')).toThrow()
    expect(readImportedFlags(undefined).entries).toEqual({})
  })
})
