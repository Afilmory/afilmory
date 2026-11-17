import type { Translations } from './types'

export const en: Translations = {
  meta: {
    title: 'Afilmory — An online gallery for your photography',
    description:
      'Upload your photos and Afilmory reads the camera, lens and exposure, then lays them out at their original proportions. Look at them on the web or on iPhone, or run it on your own server.',
  },
  nav: {
    login: 'Log in',
    create: 'Create gallery',
    lang: '中文',
  },
  hero: {
    title: ['A gallery for', 'your photos.'],
    subtitle:
      'Upload your photos and Afilmory reads the camera, lens and exposure, then lays them out at their original proportions. Look at them on the web or on iPhone, or run it on your own server.',
    newsLabel: 'New',
    news: 'Wander wall',
    shotAlt: 'The Afilmory photo viewer: the photo, the settings panel on the right and the thumbnail strip',
  },
  statement: {
    lead: 'Cloud drives are for storing photos, not for showing them. ',
    rest: 'Thumbnails get cropped to squares, the settings are hidden, and sharing means sending a list of file names. In Afilmory each photo keeps its shape, the settings sit next to it, and what you share is a link people can actually browse.',
  },
  principles: [
    {
      title: 'Settings read for you',
      body: 'Camera, lens, aperture, shutter and ISO come straight from the EXIF. Nothing to type in.',
    },
    { title: 'Colours follow the photo', body: 'Open a photo and the buttons and highlights take on its main colour.' },
    {
      title: 'Web, iPhone, self-hosted',
      body: 'Upload on your phone and it shows up on the web right away. Self-hosting runs the same software.',
    },
  ],
  wall: {
    title: ['Original', 'proportions'],
    body: 'Nothing gets cropped, so portraits stay portrait. Filter by tag, camera, lens, rating and date, or switch to a list. Open a photo to see its full settings and histogram.',
    shotAlt: 'The Afilmory gallery home: photos in a masonry layout at their original proportions',
    details: [
      { title: 'Live Photo', body: 'Plays with sound on hover or long press' },
      { title: 'Map', body: 'Photos with GPS data show up on a map' },
      { title: 'Progressive originals', body: 'The thumbnail shows first, the original replaces it once loaded' },
      { title: 'Custom domain', body: 'your-name.afilmory.art by default, or your own domain' },
    ],
  },
  canvas: {
    title: ['Wander', 'wall'],
    body: 'All your photos on one canvas you can drag around. Rearrange it by month, camera, tag or colour; hold a photo and similar ones move closer; zoom out below 20% and it turns into a film strip.',
    shotAlt: 'The wander wall: photos on a canvas with Wander, Month, Camera, Tag and Color arrangements',
  },
  discover: {
    title: 'Other people’s galleries',
    photos: 'photos',
    loading: 'Loading…',
    empty: 'No featured galleries yet.',
    error: 'Could not load the gallery list.',
  },
  ways: {
    title: ['Upload from the app,', 'or host it yourself'],
    body: 'The easiest way is the iPhone app. If you want your photos to stay in your own storage, deploy a copy with Docker.',
    iphone: {
      title: 'iPhone',
      body: 'Upload photos, organise your gallery and look at other people’s.',
      shotAlt: 'The gallery home screen of the Afilmory iPhone app',
    },
    selfHost: {
      title: 'Self-host',
      body: 'Open source. One command to start; storage can be S3, B2, GitHub or a local folder.',
      copy: 'Copy',
      copied: 'Copied',
      copyLabel: 'Copy command',
      guide: 'Deployment docs',
    },
  },
  open: {
    title: ['Create your', 'gallery'],
    button: 'Create gallery',
    pending: 'Checking…',
    fine: 'Free for 500 photos and 5 GB · add your own domain later',
  },
  createModal: {
    label: 'Create gallery',
    title: 'Create a gallery',
    description: 'Pick a name. It becomes the gallery’s address.',
    inputLabel: 'Gallery name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    tipsTitle: 'Rules',
    tips: [
      '3–32 characters: lowercase letters, numbers and hyphens',
      'The free plan covers 500 photos and 5 GB of storage',
      'You can add your own domain later in the dashboard',
    ],
    button: 'Create',
    buttonPending: 'Creating…',
    close: 'Cancel',
    validations: {
      required: 'Enter a gallery name',
      minLength: 'The name needs at least 3 characters',
      invalid: 'Use only lowercase letters, numbers and hyphens',
    },
    errors: {
      generic: 'Could not create the gallery. Try again.',
      network: 'Network error. Check your connection and try again.',
      missingRedirect: 'The server did not return a redirect address.',
    },
  },
  loginModal: {
    label: 'Log in',
    title: 'Log in to your gallery',
    description: 'Enter the gallery name to go to its dashboard.',
    inputLabel: 'Gallery name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    button: 'Continue',
    close: 'Cancel',
    validations: {
      required: 'Enter a gallery name',
      minLength: 'The name needs at least 3 characters',
      invalid: 'Use only lowercase letters, numbers and hyphens',
    },
  },
  footer: {
    terms: 'Terms',
    privacy: 'Privacy',
    docs: 'Docs',
    github: 'GitHub',
    selfHost: 'Deployment docs',
    appStore: 'App Store',
  },
}
