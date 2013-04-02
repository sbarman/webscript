# Define here the models for your scraped items
#
# See documentation in:
# http://doc.scrapy.org/topics/items.html

from scrapy.item import Item, Field

class AlexaItem(Item):
    # define the fields for your item here like:
    # name = Field()
    category = Field()
    name = Field()
    link = Field()
    desc = Field()
    rank = Field()
