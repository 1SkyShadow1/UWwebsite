export function renderLanding({ linkButton }) {
  return `<section class="landing-page">
    <div class="landing-photo"></div><div class="landing-grain"></div>
    <div class="landing-copy"><a class="landing-wordmark" href="/index.html">UPHOLSTERY<br>WAREHOUSE</a><p class="spec-label">ALL THINGS UPHOLSTERY</p><h1>Give good furniture<br><strong>another story.</strong></h1><p>Reupholstery, custom work and carefully chosen materials for the pieces and spaces you want to keep.</p><div class="hero-actions">${linkButton('Discover the workshop','/services.html','gold')}${linkButton('Browse materials','/materials.html','ghost')}</div><a class="landing-enter" href="/index.html">ENTER THE SHOWROOM ↓</a></div>
    <div class="landing-caption"><span>CRAFT / MATERIAL / HOME</span><span>JOHANNESBURG, SOUTH AFRICA</span></div>
  </section>`
}
