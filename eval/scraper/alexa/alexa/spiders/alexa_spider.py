from scrapy.spider import Spider
from scrapy.selector import HtmlXPathSelector
from scrapy import Selector
from scrapy.http import Request
from alexa.items import AlexaItem

class AlexaSpider(Spider):
    name = "alexa"
    allowed_domains = ["alexa.com"]
    start_urls = [
      "http://www.alexa.com/topsites/category"
    ]
    site = "http://www.alexa.com"

    def parse(self, response):
        hxs = Selector(response)
        # for url in hxs.xpath("/html/body/div/div/div[3]/div/div/div/div/" +\
        #                       "div/div//a/@href").extract():
        for url in hxs.xpath("//*[@id='alx-content']/div/section[2]/span/" +\
                             "span/div/div/ul/li/a/@href").extract():
            yield Request(self.site + url, callback=self.parseCat)

    def parseCat(self, response):
        hxs = Selector(response)
        sites = hxs.xpath("//li[@class='site-listing']")
        cat = hxs.xpath("//*[@id='alx-content']/div/section[1]/div/section/div/span/h2/span[1]/a[2]/text()").extract()

        for site in sites:
            url = site.xpath("div[2]/p/a/@href").extract()[0]
            print self.site
            print url
            request = Request(self.site + url, callback=self.parseSite)
            request.meta['cat'] = cat
            request.meta['catrank'] = site.xpath("div[1]/text()").extract()
            yield request

    def parseSite(self, response):
        hxs = Selector(response)
        name = hxs.xpath("//*[@id='js-li-last']/span[1]/a/text()").extract()
        desc = hxs.xpath("//*[@id='contact-panel-content']/div[2]/span[1]/p[1]/text()").extract()
        rank = hxs.xpath("//*[@id='traffic-rank-content']/div/span[2]/div[1]/span/span/div/strong/text()").extract()
        country = hxs.xpath("//*[@id='traffic-rank-content']/div/span[2]/div[2]/span/span/h4/a/text()").extract()
        country_rank = hxs.xpath("//*[@id='traffic-rank-content']/div/span[2]/div[2]/span/span/div/strong/text()").extract()

        item = AlexaItem()
        item['rank'] = rank 
        item['category'] = response.meta['cat']
        item['category_rank'] = response.meta['catrank']
        item['name'] = name
        item['desc'] = desc
        item['country'] = country
        item['country_rank'] = country_rank

        return item

