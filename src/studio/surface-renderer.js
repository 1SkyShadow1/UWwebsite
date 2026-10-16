import { photoMaterialResponse } from './material-response.js'

const vertex=`#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=vec2((position.x+1.)*.5,1.-(position.y+1.)*.5);gl_Position=vec4(position,0.,1.);}`
const fragment=`#version 300 es
precision highp float;
in vec2 uv;
out vec4 outputColor;
uniform sampler2D photo,surface,geometry,fabric,normalMap,roughnessMap;
uniform vec2 resolution,fabricSize;
uniform vec4 bounds;
uniform vec3 lightDirection;
uniform float comparison,roughness,sheen,anisotropy,clearcoat,relief,repeats,specularStrength,hasNormal,hasRoughness,showMask;
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 toSRGB(vec3 c){c=max(c,vec3(0.));return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 projection(sampler2D map,vec3 p,vec3 w){return texture(map,p.zy).rgb*w.x+texture(map,p.xz).rgb*w.y+texture(map,p.xy).rgb*w.z;}
void main(){
  vec4 original=texture(photo,uv),s=texture(surface,uv),shape=texture(geometry,uv);
  if(s.a<.002||uv.x<comparison){outputColor=original;return;}
  vec2 xy=shape.rg*2.-1.;
  vec3 n=normalize(vec3(xy,sqrt(max(.08,1.-dot(xy,xy)))));
  vec3 weights=pow(abs(n),vec3(6.));weights/=max(.001,weights.x+weights.y+weights.z);
  vec2 local=(uv-bounds.xy)/max(bounds.zw,vec2(.001));
  float aspect=resolution.x*bounds.z/max(1.,resolution.y*bounds.w);
  float depth=dot(s.rb,vec2(65280./65535.,255./65535.));
  vec3 p=vec3(local.x,local.y/max(.25,aspect),depth*.24)*repeats;
  vec3 albedo=toLinear(projection(fabric,p,weights));
  if(hasNormal>.5){
    // Base colour, roughness and relief use the same coordinates on every plane.
    vec2 a=texture(normalMap,p.zy).rg*2.-1.;
    vec2 b=texture(normalMap,p.xz).rg*2.-1.;
    vec2 c=texture(normalMap,p.xy).rg*2.-1.;
    vec3 micro=vec3(0.,a.y,a.x)*weights.x+vec3(b.x,0.,b.y)*weights.y+vec3(c,0.)*weights.z;
    n=normalize(n+micro*relief);
  }
  vec3 l=normalize(lightDirection),v=vec3(0.,0.,1.),h=normalize(l+v);
  float ndl=max(.0,dot(n,l)),ndv=max(.05,n.z),ndh=max(.0,dot(n,h));
  float r=clamp(roughness*(hasRoughness>.5?mix(.85,1.08,projection(roughnessMap,p,weights).r):1.),.24,1.);
  float alpha=r*r,a2=alpha*alpha,den=ndh*ndh*(a2-1.)+1.;
  float distribution=a2/(3.14159265*den*den+.001);
  float k=(r+1.)*(r+1.)/8.;
  float visibility=(ndl/(ndl*(1.-k)+k+.001))*(ndv/(ndv*(1.-k)+k));
  float fresnel=.04+.96*pow(1.-max(.0,dot(h,v)),5.);
  float spec=min(.12,distribution*visibility*fresnel/(4.*max(.08,ndl*ndv)))*specularStrength;
  float illumination=clamp(s.g*(255./128.),.015,1.99),contact=shape.b;
  float highlightVisibility=contact*contact*smoothstep(.1,.9,shape.a);
  float pile=1.+anisotropy*(ndl-.6)*.24;
  // The captured diffuse layer remains the main light. New highlights are
  // bounded, occluded in seams and tinted by the fibre rather than painted white.
  vec3 color=albedo*illumination*contact*pile*(1.-spec);
  color+=vec3(spec)*illumination*highlightVisibility;
  vec3 fibre=sqrt(max(albedo,vec3(.001)));
  color+=fibre*pow(1.-ndv,2.)*sheen*.13*ndl*illumination*highlightVisibility;
  vec3 environment=toLinear(textureLod(photo,clamp(vec2(.5+n.x*.35,.15-n.y*.35),vec2(0.),vec2(1.)),r*5.+2.).rgb);
  color+=environment*clearcoat*spec*highlightVisibility;
  if(showMask>.5)color=toLinear(vec3(.96,.81,.22));
  outputColor=vec4(mix(toLinear(original.rgb),max(color,vec3(0.)),s.a),original.a);
  outputColor.rgb=clamp(toSRGB(outputColor.rgb),0.,1.);
}`

export function createSurfaceRenderer(canvas, { onContextLost=()=>{} }={}) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'})
  if(!gl)throw new Error('WebGL 2 is unavailable. The Studio will use its compatibility renderer.')
  const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message)}return shader}
  const program=gl.createProgram(), shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)]
  for(const shader of shaders)gl.attachShader(program,shader)
  gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('The fabric renderer could not initialise.')
  gl.useProgram(program)
  const vao=gl.createVertexArray();gl.bindVertexArray(vao)
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW)
  const attribute=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0)
  const uniforms=new Map(), textures=[]
  const uniform=name=>{if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(program,name));return uniforms.get(name)}
  const names=['photo','surface','geometry','fabric','normalMap','roughnessMap']
  names.forEach((name,index)=>{
    const texture=gl.createTexture();textures.push(texture);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,index>=3?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,index>=3?gl.REPEAT:gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(index===2?[128,128,255,255]:index===4?[128,128,255,255]:[128,128,128,255]))
    gl.uniform1i(uniform(name),index)
  })
  let analysisWidth=1,analysisHeight=1,disposed=false,lost=false
  const upload=(index,image)=>{
    gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false)
    if(image.data)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,image.width,image.height,0,gl.RGBA,gl.UNSIGNED_BYTE,image.data)
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image)
    if(index===0||index>=3){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR)}
  }
  const lostHandler=event=>{event.preventDefault();lost=true;onContextLost()}
  canvas.addEventListener('webglcontextlost',lostHandler)
  return {
    maxDimension:Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),8192),
    setSource(image){upload(0,image)},
    setAnalysis(analysis,width,height){analysisWidth=width;analysisHeight=height;upload(1,{width,height,data:analysis.data});upload(2,{width,height,data:analysis.geometry});gl.useProgram(program);gl.uniform4fv(uniform('bounds'),analysis.bounds);},
    setMaterial(images,material){
      upload(3,images.color);if(images.normal)upload(4,images.normal);if(images.roughness)upload(5,images.roughness)
      gl.useProgram(program);const response=photoMaterialResponse(material)
      for(const key of ['roughness','sheen','anisotropy','clearcoat','specularStrength'])gl.uniform1f(uniform(key),response[key])
      gl.uniform1f(uniform('relief'),response.photoRelief)
      gl.uniform1f(uniform('hasNormal'),images.normal?1:0);gl.uniform1f(uniform('hasRoughness'),images.roughness?1:0)
      gl.uniform2f(uniform('fabricSize'),images.color.width,images.color.height)
      gl.uniform1f(uniform('repeats'),2.1/response.tileMetres)
    },
    render({compare=.5,showMask=false,width=canvas.width,height=canvas.height}={}){
      if(disposed||lost)throw new Error('The graphics device was reset. Reload the Studio to resume the preview.')
      if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height
      gl.useProgram(program);gl.bindVertexArray(vao);gl.viewport(0,0,width,height)
      gl.uniform2f(uniform('resolution'),analysisWidth,analysisHeight)
      gl.uniform3f(uniform('lightDirection'),-.45,-.55,1.)
      gl.uniform1f(uniform('comparison'),compare);gl.uniform1f(uniform('showMask'),showMask?1:0)
      gl.drawArrays(gl.TRIANGLES,0,3)
    },
    dispose(){disposed=true;canvas.removeEventListener('webglcontextlost',lostHandler);textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()},
  }
}
