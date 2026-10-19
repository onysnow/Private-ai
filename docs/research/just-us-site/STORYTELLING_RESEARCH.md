# Just-Us product site: storytelling references (research, 19 Oct 2026)

Research before the mockups. No code, no generated images. The mockups will use stock photographs.

**What was checked:** web search results and their summaries only. I did not open these sites in a browser, so I have not seen their layouts myself. Fetching the Pudding article and Unsplash's help page failed (DNS errors in this container), and Firecrawl is out of credits. Anything marked *unconfirmed* needs a look before we rely on it.

## 1. References to study, by what they teach

### Scroll-driven journalism (the closest relatives)
| Reference | What to take from it | For which scene |
|---|---|---|
| [NYT "Snow Fall" (2012)](https://source.opennews.org/articles/how-we-made-snow-fall/) | The benchmark. The team cut any video or audio that only repeated the text. Each element had to give a different experience of the story. It was criticised for being long and for media that distracted from the text. | Whole site: every scene has to earn its screen time |
| [Guardian "Firestorm" (2013)](https://poynter.org/?p=214884) | Built from one photograph. Video sits behind the text without competing with it. Chapter navigation kept readers oriented. | Chapter markers (Gaza, the tree, ICE, the files, Washington) |
| [Reuters, Gaza destruction (2024)](https://www.inma.org/blogs/ideas/post.cfm/going-inside-the-rubble-and-ruin-of-gaza) | Rendered 125,000+ buildings in 3D as you scroll. Gave the scale by comparison: the rubble would fill the Great Pyramid more than 11 times, and Gaza's buildings were set against Manhattan's. | Gaza: scale people can feel |
| [NYT Visual Investigations, Breonna Taylor](https://innovation.media/insights/visual-investigations) | A 3D reconstruction of an apartment from scraps of evidence, accounting for each of the 32 bullets. The [Yale talk](https://dhlab.yale.edu/events/2022-11-30-singhvi-talk.html) covers the methods. *Scroll format unconfirmed.* | The crime-scene room; ICE |
| [Washington Post "Fatal Force"](https://peabodyawards.com/fatalforce) | The landing page shows a rolling count of people killed by police in the last year, with victims' names animating behind it ([Storybench](https://www.storybench.org/?p=12103)). Won a Peabody. | The ending: names and counts rather than adjectives |
| [Forensic Architecture, "A Cartography of Genocide"](https://www.dezeen.com/2024/11/22/gaza-destruction-interactive-map-forensic-architecture/amp/) | An evidence map of Gaza with layers you switch on and a time slider. It is an investigation platform outside the institutions, which is what Just-Us is. | Gaza; and the product pitch |
| [EJI + Google, "Lynching in America" (2017)](https://newsone.com/3719162/bryan-stevensons-eji-launches-lynching-site-with-google) | Map down to county level, audio stories and a short documentary, all about families. EJI's site has won a [Webby](https://eji.org/news/eji-webby-award/). *Current status unconfirmed.* | The tree scene: tone and dignity |
| [Al Jazeera "Know their names"](https://janataweekly.org/al-jazeera-the-tv-channel-that-saves-the-honor-of-modern-journalism/) | Names and faces of the journalists killed in Gaza. *The original page was not found.* | Gaza: people, not numbers |

### Scroll as a film (the camera, the scene changes)
| Reference | What to take from it |
|---|---|
| [SBS "The Boat" (2015)](https://www.commarts.com/project/23899/the-boat) | The closest match in spirit. A scrolling graphic novel. Text sways at an angle during the storm, the screen shakes, there's sound design and an optional auto-scroll. 222 illustrations, 59 animated sequences ([SBS](https://www.sbs.com.au/movies/article/2015/04/27/sound-and-vision-boat)). Its weather and parallax are the model for the opening rain. |
| [NFB "Bear 71" (2012)](https://opendoclab.mit.edu/bear-71) | Linear narration over imagery you explore, about 20 minutes long. When the story ends you can wander the map. |
| [IVRESS by Utsubo](https://www.utsubo.com/blog/immersive-storytelling-websites-guide) | Its scenes are joined by continuous camera and material changes, with no hard cuts. This is the model for "the floor becomes the scene wipe". |
| [Noomo's site](https://www.webgpu.com/tag/interactive-storytelling/) | Each story is a room in a lit hallway, driven by scroll. |
| [Codrops, "A scroll-driven 3D world with something to say" (Apr 2026)](https://tympanus.net/codrops/?p=114641) | A recent write-up of a site meant to feel like a place you arrive in. It took 3 to 4 months. The author admits ordinary page layouts usually have better UX. |
| [scroll-world (GitHub)](https://github.com/sw7rvy/scroll-world) | One camera shot with no cuts, through four story beats, with a simpler fallback for phones. |
| [Apple's product pages](https://www.setproduct.com/blog/how-to-3d-animate-scroll) | Scroll scrubs pre-rendered frames drawn on a canvas, not video. Video seeking lags scroll by 50 to 150 ms. WebP frames are far smaller than PNG ([GSAP forum](https://gsap.com/community/forums/topic/25188-airpods-image-sequence-animation-using-scrollTrigger/)). This is the technique if a scene is filmed or rendered rather than layered. |
| Roundups: [scrollytelling.ai, 27 examples (2026)](https://scrollytelling.ai/examples/), [Maglr](https://www.maglr.com/blog/best-scrollytelling-examples) | Places to browse. |

## 2. What the research says to do on phones
- **Keep the scroll on mobile when the transitions carry meaning.** Don't stack the content on phones. This is the Pudding's advice ([Responsive scrollytelling](https://pudding.cool/process/responsive-scrollytelling/), excerpt only), and the window → blinds → room → floor transitions are the meaning here.
- **Use a sticky stage:** the picture stays fixed while the steps play, then lets go ([Pudding on sticky](https://pudding.cool/process/scrollytelling-sticky/), [Scrollama](https://pudding.cool/process/introducing-scrollama/)).
- **Design for the phone early.** It forces the story down to its essentials.
- **Reduced motion:** W3C counts parallax and scroll-triggered zooms as vestibular triggers ([C39](https://w3.org/WAI/WCAG22/Techniques/css/C39)). With reduced motion on, the movement that carries meaning should become fades, and decorative parallax should be dropped ([reduced-motion spec](https://specification.website/spec/accessibility/reduced-motion/)). Anything that moves for more than 5 seconds needs a pause (WCAG 2.2.2).

## 3. Stock photographs: what can legally be used
| Source | Finding | Consequence |
|---|---|---|
| Getty / AFP news photos of Gaza | "Editorial use"; commercial or promotional use needs the local office; "Not released" (no model release); about $375 each ([example listing](https://www.gettyimages.com/detail/news-photo/displaced-palestinians-fleeing-from-the-area-in-the-news-photo/2087311406)). | A product site is promotional, so these can't be used without a negotiated licence. |
| Unsplash (free licence) | Free for commercial use. There are Gaza photographs by Gaza photographers, e.g. [Mohammed Ibrahim](https://unsplash.com/photos/destroyed-buildings-and-rubble-in-a-city-CFHOBqIm7PM), [another](https://unsplash.com/photos/people-stand-near-destroyed-buildings-under-a-clear-sky-nMPg7NE1cOI), [Mohammed Al Bardawil](https://unsplash.com/photos/a-group-of-people-standing-next-to-a-collapsed-building-uNinlSRrRPo). Identifiable people may need their own consent ([summary](https://www.equinux.com/us/faq/1585/What-do-I-need-to-know-before-I-use-Unsplash-photos)). The sensitive-topic rule ("posed by model" disclaimer) is in the paid [Unsplash+ licence](https://unsplash.com/plus/license); whether the free licence has one is *unconfirmed*. | Usable. Prefer frames with no identifiable faces, or crop them out. Credit the photographers even though it isn't required. |
| Pexels | Free. No standalone resale, and no AI training ([help](https://help.pexels.com/hc/en-us/articles/360042790573-Can-I-sell-photos-or-videos-from-Pexels)). No sensitive-use clause was found (*unconfirmed*). | Usable for the window, the room, the street and the desk. |
| Wikimedia Commons, White House staff photos | US federal works are public domain (17 U.S.C. §105). Contractor photos and some portraits are disputed, e.g. Trump's official portrait ([Daily Dot](https://lede-v2.dailydot.com/donald-trump-official-portrait-wikipedia-copyright)). | Exteriors of the White House and staff photos are usable after checking each file's author field. |

**The scenes and the risk with each:**
- **Lynching:** no stock photograph should show a real person. The scene should be built from parts: a tree, rope, legs from a posed model, the ground, a police silhouette.
- **ICE:** the same. Use posed or generic elements: a cracked windshield, flashing lights, figures in tactical gear with no faces.
- **Epstein files:** use the real released pages. US government documents are public domain, and the black redaction bars are the point.
- **Trump administration:** use public-domain White House photographs. Showing the building and not the man avoids the likeness and portrait questions.

## 4. How the research changes the plan
1. **Restraint.** Every one of these references says the same thing: each scene has to show something the words don't. For each scene the mockup will name its one image and its one line.
2. **The ending.** Fatal Force and "Know their names" both end on people. The "just us." ending could gather names or counts from the scenes before it, as the move from the problem to the product.
3. **Sources on the page.** Forensic Architecture, Reuters and the NYT cite their evidence. A site about evidence should do the same, with a small source note on each scene. That also covers the copy's factual claims.
4. **Mobile.** Keep the scroll, use a sticky stage, and give reduced motion a stills version.

## Next: the mockups
For each scene, the frames at key scroll points, in portrait (phone) and landscape: the opening rain, the blinds closing on the name, the room pulled back, the floor wipe, Gaza, the tree, ICE, the files, Washington, the message, the pitch. They will be built from the stock photographs above with their licences recorded. Nothing is generated.
