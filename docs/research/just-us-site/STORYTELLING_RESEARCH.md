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

### Whole websites that are one scroll story (the model for Just-Us)
The site itself is the story: the homepage is the scroll, from the first screen to the call to action. These are not stories embedded inside an article.

| Website | What to take from it |
|---|---|
| [Why Zero](https://winners.kyoorius.com/winners/2026/kda/16247-why-zero/) (Zero University; Awwwards Site of the Day, 7 Sep 2026) | The closest match. A whole site that argues a system is broken (education) and that this product replaces it. You draw a zero to open it, then one continuous WebGL scroll shows a dream shattering, money burning and degree certificates shredded, ending on the product. It runs as one scroll timeline in Three.js and GSAP, under 10 MB, at 60 fps on budget phones. Same structure as Just-Us: the failure, scene by scene, then the answer. |
| [The Power of Storytelling](https://www.awwwards.com/sites/the-power-of-storytelling) (Noomo; Awwwards Site of the Day, 8 Jun 2026) | The agency's own site: each client story is a room in a lit hallway, and scroll moves you through them. It has a 3D scroll section and a fly-through. This is the model for the camera moving from the window to the room. |
| [Lando Norris](https://www.awwwards.com/sites/lando-norris) (OFF+BRAND; Awwwards Site of the Year 2025) | The current top of the field for cinematic scroll sequences on a personal site, scored 8.18/10. Look at how it paces its big moments and keeps the site usable around them. |
| Cartier Watches & Wonders ([Utsubo's list](https://www.utsubo.com/blog/best-threejs-websites-2026)) | Six 3D alcoves you scroll through, one scene per product, like rooms in a museum. This is the model for one scene per injustice. |
| IVRESS, "Spin a Tale" ([Utsubo](https://www.utsubo.com/blog/immersive-storytelling-websites-guide); Awwwards Site of the Day 28 Jun 2026, FWA of the Month) | Its scenes are joined by continuous camera and material changes, with no hard cuts. This is the model for "the floor becomes the scene wipe". *Its awards and its link are unconfirmed.* |
| [Codrops, "A scroll-driven 3D world with something to say" (Apr 2026)](https://tympanus.net/codrops/?p=114641) | How someone built a whole site meant to feel like a place you arrive in, in 3 to 4 months. The author admits ordinary page layouts usually have better UX. |
| [Apple's product pages](https://www.setproduct.com/blog/how-to-3d-animate-scroll) | Scroll scrubs pre-rendered frames drawn on a canvas, not video. Video seeking lags scroll by 50 to 150 ms. WebP frames are far smaller than PNG ([GSAP forum](https://gsap.com/community/forums/topic/25188-airpods-image-sequence-animation-using-scrollTrigger/)). This is the technique if a scene is filmed or rendered rather than layered. |
| Where to browse more: [Awwwards Storytelling](https://www.awwwards.com/inspiration_search/Storytelling/), [Awwwards Scrolling](https://www.awwwards.com/websites/scrolling/), [Awwwards 3D](https://www.awwwards.com/websites/3d/), [scrollytelling.ai, 27 examples](https://scrollytelling.ai/examples/) | Galleries of whole sites. |

A whole interactive manifesto costs far more than one animated section ([Metabole](https://metabole.studio/en/blog/scrollytelling)). Why Zero is the proof that it can still be light enough for budget phones.

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
- **Epstein files:** a government release does not make a page public domain. 17 U.S.C. §105 covers only work by federal employees in their official duties, such as a DOJ cover letter or an FBI form. It does not cover flight logs, emails, photographs or exhibits that were merely released with them. Before any real page is used, record who wrote it and what rights it carries. Otherwise the scene shows a stand-in page with only redaction bars, which is still the point.
- **Trump administration:** use public-domain White House photographs. Showing the building and not the man avoids the likeness and portrait questions.

## 4. How the research changes the plan
1. **Restraint.** Every one of these references says the same thing: each scene has to show something the words don't. For each scene the mockup will name its one image and its one line.
2. **The ending.** Fatal Force and "Know their names" both end on people. The "just us." ending could gather names or counts from the scenes before it, as the move from the problem to the product.
3. **Sources on the page.** Forensic Architecture, Reuters and the NYT cite their evidence. A site about evidence should do the same, with a small source note on each scene. That also covers the copy's factual claims.
4. **Mobile.** Keep the scroll, use a sticky stage, and give reduced motion a stills version.

## Next: the mockups
For each scene, the frames at key scroll points, in portrait (phone) and landscape: the opening rain, the blinds closing on the name, the room pulled back, the floor wipe, Gaza, the tree, ICE, the files, Washington, the message, the pitch. They will be built from the stock photographs above with their licences recorded. Nothing is generated.
