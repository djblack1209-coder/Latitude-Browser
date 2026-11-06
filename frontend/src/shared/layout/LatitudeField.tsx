/** Static dot graticule. No canvas, network data or idle animation. */
export function LatitudeField() {
  const particles = []
  for (let latitude = -70; latitude <= 70; latitude += 10) {
    for (let longitude = -80; longitude <= 80; longitude += 10) {
      const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180
      const depth = Math.cos(lat) * Math.cos(lon)
      particles.push(<circle key={`${latitude}:${longitude}`} className="field-particle" cx={158 + 62 * Math.cos(lat) * Math.sin(lon)} cy={72 + 62 * Math.sin(lat)} r={depth > .7 ? 1 : .65} opacity={.2 + depth * .6} />)
    }
  }
  return <svg className="latitude-field" viewBox="0 0 280 144" aria-hidden="true">
    <path className="field-orbit" d="M12 72h256M158 0v144M22 16h8m-4-4v8M248 128h8m-4-4v8" />
    <ellipse className="field-orbit" cx="158" cy="72" rx="104" ry="29" transform="rotate(-24 158 72)" />
    {particles}
    <circle className="field-point" cx="106" cy="105" r="3" />
    <circle className="field-orbit" cx="106" cy="105" r="7" />
  </svg>
}
