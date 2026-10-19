// Photographs show either the untouched source or generated upholstery. A local
// material shader is reserved for the explicitly approximate live camera mode.
export function photoPresentation({mode='photo',hasResult=false,showResult=true,showMask=false,compare=.5}={}) {
  const generated=mode==='photo'&&hasResult&&showResult&&!showMask
  return {
    generated,
    comparison:mode==='camera'||generated,
    shaderCompare:showMask?0:mode==='camera'?compare:1,
    label:showMask?'UPHOLSTERY SELECTION':mode==='camera'?'LIVE MATERIAL STUDY':generated?'AI GENERATED UPHOLSTERY':'ORIGINAL PHOTOGRAPH',
  }
}
