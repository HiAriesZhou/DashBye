// Keep this limited to facts shown on each homepage; an npm command is not a download URL.
export function serializeSoftwareApplication({ description, url, image, author, repository }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'DashBye',
    description,
    url,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    image,
    sameAs: [repository],
    author: { '@type': 'Person', name: 'AriesZhou', url: author },
  }).replace(/</g, '\\u003c');
}
