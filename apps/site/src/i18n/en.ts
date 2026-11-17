import type { Translations } from './types'

export const en: Translations = {
  meta: {
    title: 'Afilmory — One photo, one exhibition',
    description:
      'Afilmory reads the EXIF and dominant colour of every photo and hangs your work as an online exhibition people can take their time in. On the web, on iPhone and on your own server, it is the same gallery.',
  },
  nav: {
    login: 'Log in',
    create: 'Open a gallery',
    lang: '中文',
  },
  hero: {
    title: ['One photo,', 'one exhibition.'],
    subtitle:
      'Afilmory reads the EXIF and dominant colour of every photo and hangs your work as an online exhibition people can take their time in. On the web, on iPhone and on your own server, it is the same gallery.',
    newsLabel: 'New',
    news: 'Wander wall',
    shotAlt: 'The Afilmory photo viewer: the photo, the Photo Inspector panel and the thumbnail strip',
  },
  statement: {
    lead: 'Photos should not be buried in a cloud drive. ',
    rest: 'Afilmory reads the settings, colours and places out of your originals and arranges them into a gallery you can share and take your time in. Hosted, self-hosted or on iPhone, it is the same gallery.',
  },
  principles: [
    {
      title: 'Reads the original',
      body: 'Camera, lens, exposure, colour space and histogram, read straight from the original file, never recompressed.',
    },
    {
      title: 'Follows the photo',
      body: 'Open a photo and the interface takes its accent from it, tuned to stay readable.',
    },
    {
      title: 'One gallery, three doors',
      body: 'The web, the iPhone app and your own server share the same exhibition and data.',
    },
  ],
  wall: {
    title: ['Hang it', 'on the wall'],
    body: 'Your work is laid out in its true proportions as a masonry wall, or as a list or a canvas. Filter by tag, camera, lens, rating and date; open a photo and the Photo Inspector lays out its settings, tones and histogram.',
    shotAlt: 'The Afilmory gallery home: photos in a masonry wall at their original aspect ratios',
    details: [
      { title: 'Live Photo', body: 'Hover or hold to play motion and sound' },
      { title: 'Map', body: 'Geotagged photos gather by place' },
      { title: 'Progressive originals', body: 'Thumbnail first, original loads behind it' },
      { title: 'Your own domain', body: 'your-name.afilmory.art, or your own' },
    ],
  },
  canvas: {
    title: ['Wander', 'wall'],
    body: 'The whole gallery on one infinite canvas you can drag around. Rearrange it by month, camera, tag or colour; hold a photo and similar ones gather around it; zoom out past 20% and the wall rolls into a film strip.',
    shotAlt: 'The wander wall: photos on an infinite canvas with Wander, Month, Camera, Tag and Color arrangements',
  },
  discover: {
    title: 'See how others exhibit',
    photos: 'photos',
    loading: 'Loading galleries…',
    empty: 'No featured galleries yet.',
    error: 'Could not load galleries.',
  },
  ways: {
    title: ['Wherever you develop,', 'it is the same gallery'],
    body: 'Upload straight from your iPhone, or keep your photos in your own storage. Afilmory generates the thumbnails, blur placeholders and EXIF index.',
    iphone: {
      title: 'iPhone',
      body: 'Upload and curate your gallery, and visit others.',
      shotAlt: 'The exhibition screen of the Afilmory iPhone app',
    },
    selfHost: {
      title: 'Self-host',
      body: 'Open source. One command and your photos stay in your own storage.',
      copy: 'Copy',
      copied: 'Copied',
      copyLabel: 'Copy command',
      guide: 'Self-hosting guide',
    },
  },
  open: {
    title: ['Give your photos', 'an exhibition.'],
    button: 'Open a gallery',
    pending: 'Checking…',
    fine: 'Free for 500 photos / 5 GB · bring your own domain later',
  },
  createModal: {
    label: 'Create space',
    title: 'Create your space',
    description: 'Choose a unique name. It becomes your URL.',
    inputLabel: 'Space name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    tipsTitle: 'Good to know:',
    tips: [
      'Name must be 3-32 characters (letters, numbers, hyphens)',
      'Free tier includes up to 500 photos and 5GB storage',
      'You can map a custom domain anytime in settings',
    ],
    button: 'Create space',
    buttonPending: 'Creating...',
    close: 'Close',
    validations: {
      required: 'Please enter a space name',
      minLength: 'Space name must be at least 3 characters',
      invalid: 'Only lowercase letters, numbers, and hyphens are allowed',
    },
    errors: {
      generic: 'Failed to create space. Please try again.',
      network: 'Network error. Please check your connection.',
      missingRedirect: 'Server responded, but redirect URL was missing.',
    },
  },
  loginModal: {
    label: 'Log in',
    title: 'Enter your space',
    description: 'Enter your space name to open the dashboard.',
    inputLabel: 'Space name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    button: 'Go to space',
    close: 'Close',
    validations: {
      required: 'Please enter a space name',
      minLength: 'Space name must be at least 3 characters',
      invalid: 'Only lowercase letters, numbers, and hyphens are allowed',
    },
  },
  footer: {
    terms: 'Terms',
    privacy: 'Privacy',
    docs: 'Docs',
    github: 'GitHub',
    selfHost: 'Self-hosting',
    appStore: 'App Store',
  },
}
