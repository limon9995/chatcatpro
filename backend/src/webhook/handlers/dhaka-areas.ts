/**
 * Comprehensive whitelist of all areas inside Dhaka district.
 * Grouped by zone for maintainability.
 * Matching is substring-based (case-insensitive).
 */

export const DHAKA_AREA_WHITELIST: string[] = [
  // ─── DNCC ─────────────────────────────────────────────────────────────────

  // Gulshan & Banani (1212, 1213)
  'gulshan','গুলশান','banani','বনানী','baridhara','বারিধারা',
  'niketon','নিকেতন','niketon','nadda','নদ্দা','shahjadpur','শাহজাদপুর',
  'gulshan 1','gulshan 2','gulshan-1','gulshan-2',
  'banani 11','banani 17','diplomatic zone','কূটনৈতিক এলাকা',
  'ambassador','progati sarani','প্রগতি সরণি',

  // Uttara (1230)
  'uttara','উত্তরা','sector 1','sector 2','sector 3','sector 4','sector 5',
  'sector 6','sector 7','sector 8','sector 9','sector 10','sector 11',
  'sector 12','sector 13','sector 14','sector 15','sector 16','sector 17',
  'sector 18','সেক্টর ১','সেক্টর ২','সেক্টর ৩','সেক্টর ৪','সেক্টর ৫',
  'সেক্টর ৬','সেক্টর ৭','সেক্টর ৮','সেক্টর ৯','সেক্টর ১০',
  'jasimuddin','জসীমউদ্দীন','rajlaxmi','রাজলক্ষ্মী','house building',
  'uttara west','uttara east','diabari','দিয়াবাড়ী','azampur','আজমপুর',
  'airport road','বিমানবন্দর রোড','haji camp',

  // Mirpur (1216, 1206)
  'mirpur','মিরপুর','mirpur 1','mirpur 2','mirpur 10','mirpur 11','mirpur 12',
  'mirpur 13','mirpur 14','মিরপুর ১','মিরপুর ২','মিরপুর ১০','মিরপুর ১১',
  'মিরপুর ১২','মিরপুর ১৩','মিরপুর ১৪',
  'pallabi','পল্লবী','section 6','section 7','section 10','section 11',
  'section 12','শিয়া মসজিদ','shia masjid','duaripara','দোয়ারীপাড়া',
  'pirerbagh','পীরেরবাগ','rupnagar','রূপনগর','senpara','সেনপাড়া',
  'shewrapara','শেওড়াপাড়া','kazipara','কাজীপাড়া','kafrul','কাফরুল',
  'ibrahimpur','ইব্রাহিমপুর','shah ali','শাহ আলী','baitul aman',
  'national zoo','জাতীয় চিড়িয়াখানা','stadium','স্টেডিয়াম',
  'bncc','bnp','pallabi thana','kalshi','কালশী',
  'baunia','বাউনিয়া','baikal','বাইকাল',

  // Mohammadpur & Lalmatia (1207, 1225)
  'mohammadpur','মোহাম্মদপুর','lalmatia','লালমাটিয়া',
  'adabor','আদাবর','shyamoli','শ্যামলী','asad gate','আসাদ গেট',
  'asadganj','আসাদগঞ্জ','town hall','টাউন হল','mohammadpur bus stand',
  'ring road','রিং রোড','tajmahal road','তাজমহল রোড',
  'pc culture','পিসি কালচার','housing','হাউজিং','dhaka udyan',
  'ঢাকা উদ্যান','japan garden city','বছিলা','bashila','mohammadpur krishi market',
  'nurjahan road','নূরজাহান রোড','sat masjid','সাত মসজিদ',
  'khilji road','খিলজী রোড','geneva camp','জেনেভা ক্যাম্প',
  'katashur','কাটাসুর','beribadh','বেড়িবাঁধ (মোহাম্মদপুর)',

  // Tejgaon (1208)
  'tejgaon','তেজগাঁও','tejgaon industrial','তেজগাঁও শিল্প এলাকা',
  'farmgate','ফার্মগেট','hatirpool','হাতিরপুল',
  'green road','গ্রিন রোড','indira road','ইন্দিরা রোড',
  'sonargaon road','সোনারগাঁও রোড','bijoy nagar','বিজয় নগর',
  'matsyabhaban','মৎস্যভবন','karwan bazar','কারওয়ান বাজার',
  'kawran bazar','কারওয়ান বাজার','tejaon','রেলগেট তেজগাঁও',
  'malibagh','মালিবাগ rail','tejturi bazar',

  // Mohakhali (1212)
  'mohakhali','মহাখালী','gulshan avenue','বনানী ১১',
  'wireless','ওয়্যারলেস','amsettlement','আম সেটেলমেন্ট',
  'icddrb','আইসিডিডিআর','nidch','nitor','brac','ব্র্যাক',
  'square hospital','স্কয়ার হাসপাতাল','everecare','evercareহাসপাতাল',
  'tb gate','টিবি গেট','mohakhali flyover',

  // Khilkhet & Kuril (1229)
  'khilkhet','খিলক্ষেত','kuril','কুড়িল','vatara','ভাটারা',
  'nikunja','নিকুঞ্জ','nikunja 1','nikunja 2','বিশ্বরোড',
  'bisharoad','airport','বিমানবন্দর','bashundhara','বসুন্ধরা',
  'aftab nagar','আফতাব নগর','notun bazar','নতুন বাজার (খিলক্ষেত)',
  'meradia','মেরাদিয়া','badda','বাড্ডা','beraid','বেড়াইদ',
  'satarkul','সাতারকুল','dakshinkhan','দক্ষিণখান','uttarkhan','উত্তরখান',

  // ─── DSCC ─────────────────────────────────────────────────────────────────

  // Motijheel (1000)
  'motijheel','মতিঝিল','shapla chattar','শাপলা চত্বর',
  'bangladesh bank','বাংলাদেশ ব্যাংক','dilkusha','দিলকুশা',
  'purana paltan','পুরানা পল্টন','nayapaltan','নয়াপল্টন','new paltan',
  'bijoynagar','bijoy nagar','kakrail','কাকরাইল',
  'inner circular road','ইনার সার্কুলার রোড','outer circular',
  'topkhana road','তোপখানা রোড','johnson road','জনসন রোড',
  'motijheel commercial','arambagh','আরামবাগ','paltan','পল্টন',

  // Dhanmondi (1205, 1209)
  'dhanmondi','ধানমন্ডি','dhanmondi 1','dhanmondi 2','dhanmondi 27',
  'dhanmondi 32','ধানমন্ডি ৩২','road 27','road 2','ধানমন্ডি লেক',
  'dhanmondi lake','mirpur road','মিরপুর রোড (ধানমন্ডি সংলগ্ন)',
  'science lab','সায়েন্স ল্যাব','elephant road','এলিফ্যান্ট রোড',
  'kalabagan','কলাবাগান','rayer bazar','রায়েরবাজার','rayerbazar',
  'jigatola','জিগাতলা','shankar','শংকর','sobhanbag','সোভানবাগ',
  'panthapath','পান্থপথ','square','স্কয়ার','bangladesh eye hospital',

  // Gulistan & Sadarghat (1100, 1000)
  'gulistan','গুলিস্তান','sadarghat','সদরঘাট','shapla','শাপলা',
  'fulbaria','ফুলবাড়িয়া','গোলাপ শাহ মাজার','golapshah',
  'bahadur shah park','বাহাদুর শাহ পার্ক','nawabpur','নবাবপুর',
  'chawkbazar','চকবাজার','islampur','ইসলামপুর',
  'tantibazar','তাঁতিবাজার','shankhari bazar','শাঁখারী বাজার',
  'nazira bazar','নাজিরা বাজার','mitford','মিটফোর্ড',
  'babu bazar','বাবুবাজার','wise ghat','ওয়াইজ ঘাট',

  // Wari (1203)
  'wari','ওয়ারী','tikatuli','টিকাটুলি','gandaria','গেন্ডারিয়া',
  'armanitola','আর্মানিটোলা','bongshal','বংশাল','bangshal',
  'sutrapur','সূত্রাপুর','faridabad','ফরিদাবাদ',
  'dholaikhal','ধোলাইখাল','shankhari','শাঁখারী','ahsan manzil',
  'বাংলাবাজার','bangla bazar','kotwali','কোতোয়ালি',

  // Jatrabari & Sayedabad (1236)
  'jatrabari','যাত্রাবাড়ী','sayedabad','সায়েদাবাদ',
  'shyampur','শ্যামপুর','kadamtali','কদমতলী','demra','ডেমরা',
  'matuail','মাতুয়াইল','donia','দনিয়া','rayerbazar (south)',
  'mugda','মুগদা','matuail south','narinda','নারিন্দা',
  'ruhitpur','রুহিতপুর','kutubkhali','কুতুবখালী',
  'pagla','পাগলা (নারায়ণগঞ্জ সংলগ্ন ঢাকা সাইড)',

  // Lalbagh & Old Dhaka (1211)
  'lalbagh','লালবাগ','lalbagh fort','লালবাগ কেল্লা',
  'hazaribagh','হাজারীবাগ','hazaribag','kamrangirchar','কামরাঙ্গীরচর',
  'azimpur','আজিমপুর','newmarket','নিউমার্কেট','new market',
  'elephant road (azimpur side)','নীলক্ষেত','nilkhet',
  'bakshi bazar','বক্শী বাজার','imamganj','ইমামগঞ্জ',
  'nawabganj','নবাবগঞ্জ (লালবাগ)','urdu road','উর্দু রোড',
  'zindabahar','জিন্দাবাহার','chadni ghat','চাঁদনী ঘাট',
  'abul hasnat road','আবুল হাসনাত রোড',

  // Shahbagh & Ramna
  'shahbagh','শাহবাগ','ramna','রমনা','tsc','curzon hall',
  'university of dhaka','ঢাকা বিশ্ববিদ্যালয়','du area',
  'national museum','জাতীয় জাদুঘর','burdwan house',
  'bangabhaban','বঙ্গভবন (সংলগ্ন)','moghbazar','মগবাজার',
  'banglamotor','বাংলামটর','wireless gate','কমলাপুর','kamalapur',
  'malibagh','মালিবাগ','rajarbagh','রাজারবাগ','siddheshwari',
  'সিদ্ধেশ্বরী','baily road','বেইলী রোড','shantinagar','শান্তিনগর',

  // Paltan, Kakrail & Shantinagar (1217)
  'paltan','পল্টন','shantinagar','শান্তিনগর','kakrail','কাকরাইল',
  'purana paltan','পুরানা পল্টন','press club','প্রেস ক্লাব',
  'secretariat','সচিবালয়','high court','হাইকোর্ট',
  'supreme court','সুপ্রিম কোর্ট','baitul mukarram','বায়তুল মোকাররম',
  'fazlul huq avenue','ফজলুল হক এভিনিউ','rajuk avenue',
  'dilkusha commercial','দিলকুশা কমার্শিয়াল',

  // Postal codes (user might type these)
  '1000','1100','1203','1204','1205','1206','1207','1208','1209',
  '1210','1211','1212','1213','1214','1215','1216','1217','1218',
  '1219','1220','1221','1222','1223','1224','1225','1226','1227',
  '1228','1229','1230','1236',
];
