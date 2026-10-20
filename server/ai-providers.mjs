export const AI_PROVIDERS=Object.freeze({
  openai:{name:'OpenAI',keyVariables:['OPENAI_API_KEY']},
  google:{name:'Google Gemini',keyVariables:['GEMINI_API_KEY','GOOGLE_API_KEY']},
  pollinations:{name:'Pollinations',keyVariables:['POLLINATIONS_API_KEY']},
})

export const aiProviderName=provider=>AI_PROVIDERS[provider]?.name
export const aiProviderVariable=provider=>AI_PROVIDERS[provider]?.keyVariables[0]
export const aiProviderKey=(provider,env=process.env)=>AI_PROVIDERS[provider]?.keyVariables.map(name=>env[name]?.trim()).find(Boolean) || null
