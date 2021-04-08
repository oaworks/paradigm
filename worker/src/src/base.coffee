

# BASE provide a search endpoint, but must register our IP to use it first
# limited to non-commercial and 1 query per second, contact them for more options
# register here: https://www.base-search.net/about/en/contact.php (registered)
# docs here:
# http://www.base-search.net/about/download/base_interface.pdf

P.src.base = {}

P.src.base.doi = (doi, format) ->
	res = await @src.base.get doi
	return if format then @src.base.format(res) else res

P.src.base.title = (title) ->
  simplify = /[\u0300-\u036F]/g
  title = title.toLowerCase().normalize('NFKD').replace(simplify,'').replace(/ß/g,'ss')
  ret = await @src.base.get 'dctitle:"'+title+'"'
  if ret?.dctitle? or ret.title?
    ret.title ?= ret.dctitle
    if ret.title
      ct = ret.title.toLowerCase().normalize('NFKD').replace(simplify,'').replace(/ß/g,'ss')
      if ct and ct.length <= title.length*1.2 and ct.length >= title.length*.8 and title.replace(/ /g,'').indexOf(ct.replace(' ','').replace(' ','').replace(' ','').split(' ')[0]) isnt -1
        return ret
  return undefined

P.src.base.get = (qry) ->
	res = await @src.base.search qry
	res = if res?.docs?.length then res.docs[0] else undefined
	if res?
		res.url = await @resolve res.dclink
	return res

P.src.base.search = (qry='*', from, size, format) ->
  # it uses offset and hits (default 10) for from and size, and accepts solr query syntax
  # string terms, "" to be next to each other, otherwise ANDed, can accept OR, and * or ? wildcards, brackets to group, - to negate
  proxy = @S.proxy # need to route through the proxy so requests come from registered IP
  return undefined if not proxy
  qry = qry.replace(/ /g,'+') if qry.indexOf('"') is -1 and qry.indexOf(' ') isnt -1
  url = 'https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?func=PerformSearch&format=json&query=' + qry
  url += '&offset=' + from if from # max 1000
  url += '&hits=' + size if size # max 125
  url += '&sortBy=dcdate+desc'
  try
    res = await @fetch url #, {timeout:timeout,npmRequestOptions:{proxy:proxy}}
    res = JSON.parse(res.content).response
    if format
      for d of res.docs
        res.docs[d] = await @src.base.format res.docs[d]
    res.data = res.docs
    delete res.docs
    res.total = res.numFound
    return res

P.src.base.format = (rec, metadata={}) ->
  try metadata.title ?= rec.dctitle
  try metadata.doi ?= rec.dcdoi[0]
  try
    metadata.author ?= []
    for a in rec[if rec.dcperson? then 'dcperson' else 'dccreator']
      as = a.split(' ')
      ar = {name: a, given:as[as.length-1]}
      try ar.family = as[0]
      metadata.author.push ar
  try metadata.journal ?= rec.dcsource.split(',')[0]
  try metadata.volume ?= rec.dcsource.toLowerCase().split('vol')[1].split(',')[0].trim()
  try metadata.issue ?= rec.dcsource.toLowerCase().split('iss')[1].split(',')[0].trim()
  try metadata.page ?= rec.dcsource.toLowerCase().split('iss')[1].split('p')[1].split('(')[0].trim()
  try metadata.year ?= rec.dcyear
  try metadata.published ?= rec.dcdate.split('T')[0]
  try
    if metadata.year and not metadata.published
      metadata.published = metadata.year + '-01-01'
  try metadata.publisher ?= rec.dcpublisher[0]
  try
    for id in rec.dcrelation
      if id.length is 9 and id.indexOf('-') is 4
        meta.issn ?= id
        break
  try metadata.keyword ?= rec.dcsubject
  try metadata.abstract ?= rec.dcdescription.replace('Abstract ','')
  try metadata.url ?= rec.dclink
  try metadata.pdf ?= rec.pdf
  try metadata.url ?= rec.url
  try metadata.redirect ?= rec.redirect
  return metadata

