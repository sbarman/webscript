# Define here the models for your scraped items
#
# See documentation in:
# http://doc.scrapy.org/topics/items.html

from scrapy.item import Item, Field

class AlexaItem(Item):
    # define the fields for your item here like:
    # name = Field()
    name = Field()
    rank = Field()
    category = Field()
    category_rank = Field()
    country = Field()
    country_rank = Field()
    desc = Field()
