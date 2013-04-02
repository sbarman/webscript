from scrapy.spider import BaseSpider
from scrapy.selector import HtmlXPathSelector
from scrapy.http import Request
from alexa.items import AlexaItem

class AlexaSpider(BaseSpider):
    name = "alexa"
    allowed_domains = ["alexa.com"]
    start_urls = [
      "http://www.alexa.com/topsites/category"
    ]
    site = "http://www.alexa.com"

    def parse(self, response):
        hxs = HtmlXPathSelector(response)
        for url in hxs.select("/html/body/div/div/div[3]/div/div/div/div/" +\
                              "div/div//a/@href").extract():
            yield Request(self.site + url, callback=self.parseCat)

    def parseCat(self, response):
        hxs = HtmlXPathSelector(response)
        sites = hxs.select("//li[@class='site-listing']")
        cat = hxs.select("/html/body/div/div/div[3]/div/div/div/div/div/div/a[2]/text()").extract()

        for site in sites:
            rank = site.select("div[1]/text()").extract()
            if int(rank[0]) <= 5:
                item = AlexaItem()
                item['rank'] = rank 
                item['category'] = cat
                item['name'] = site.select("div[2]/h2/a/text()").extract()
                item['link'] = site.select("div[2]/span/text()").extract()
                item['desc'] = site.select("div[2]/div/text()").extract()
                yield item
