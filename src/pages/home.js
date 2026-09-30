export function renderHome({ linkButton, media }) {
  return `
    <section class="stitch-hero">
      <div class="hero-backdrop"></div><div class="hero-glow"></div>
      <div class="hero-content">
        <p class="hero-overline">UPHOLSTERY WAREHOUSE / JOHANNESBURG</p>
        <h1>Keep what you love.<br><strong>Make it yours again.</strong></h1>
        <p class="hero-lede">Thoughtful upholstery for furniture with more life in it. Explore materials, imagine a new finish and find the right next step for your piece.</p>
        <div class="hero-actions">${linkButton('Explore the material library', '/materials.html', 'gold')}${linkButton('See what is possible', '/services.html', 'ghost')}</div>
        <div class="hero-scroll-cue"><span></span> SCROLL TO EXPLORE</div>
      </div>
    </section>
    <section class="section pathways">
      <div class="section-heading"><div><p class="spec-label gold-text">A GOOD PLACE TO BEGIN</p><h2>What are you dreaming up?</h2></div><p>From one well-loved chair to a complete room, start wherever you are.</p></div>
      <div class="path-grid">${[
        ['/materials.html','Find your material','Explore upholstery textures, colour and care.','/assets/textile-editorial.jpg'],
        ['/ai-studio.html','Try a new direction','Preview colour and finish on your own furniture photo.','/assets/sofa-editorial.jpg'],
        ['/services.html','Restore or remake','Discover upholstery services and ways to work together.','/assets/stitch/stitch-craftsman.png'],
        ['/estimator.html','Plan your project','Build an early brief before a consultation.','/assets/sofa-editorial.jpg'],
      ].map(([path,title,copy,image]) => `<a class="path-card path-card-image" href="${path}"><img src="${image}" alt="" loading="lazy"><span class="path-card-shade"></span><div><h3>${title}</h3><p>${copy}</p><span class="path-link">EXPLORE ↗</span></div></a>`).join('')}</div>
    </section>
    <section class="section home-editorial"><div class="home-editorial-copy"><p class="spec-label gold-text">MADE TO BE LIVED WITH</p><h2>Good bones.<br><strong>Better layers.</strong></h2><p>A familiar shape can feel entirely new with the right fabric, thoughtful making and the details that bring it all together.</p>${linkButton('Meet the workshop', '/services.html', 'gold')}</div><div class="home-editorial-image">${media('/assets/interior-editorial.jpg','A considered living room with tactile upholstery')}</div></section>
    <section class="home-material-callout"><img src="/assets/textile-editorial.jpg" alt="Close-up of upholstery textile texture" loading="lazy"><div><p class="spec-label">FEEL FIRST. DECIDE WITH CONFIDENCE.</p><h2>Texture changes<br>everything.</h2><a class="text-link" href="/materials.html">Enter the material library ↗</a></div></section>`
}
